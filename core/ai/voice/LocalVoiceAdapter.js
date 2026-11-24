'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile, spawn } = require('node:child_process');
const { promisify } = require('node:util');
const { VoiceAdapter, FALLBACK_STT_MESSAGE } = require('./VoiceAdapter');

const execFileAsync = promisify(execFile);

/**
 * Self-hosted local VoiceAdapter wrapper (`whisper.cpp` for STT, Piper + ffmpeg
 * to OGG/Opus for TTS). Intended only for self-hosted deployments with sufficient RAM,
 * activated via `VOICE_STT_DRIVER=local` / `VOICE_TTS_DRIVER=piper`.
 */
class LocalVoiceAdapter extends VoiceAdapter {
  /**
   * @param {{
   *   whisperBinPath?: string,
   *   whisperModelPath?: string,
   *   piperBinPath?: string,
   *   piperModelPath?: string,
   *   ffmpegBinPath?: string,
   *   timeoutMs?: number
   * }} [options]
   */
  constructor(options = {}) {
    super();
    this.whisperBinPath =
      options.whisperBinPath ?? process.env.WHISPER_BIN_PATH ?? '/usr/bin/whisper';
    this.whisperModelPath =
      options.whisperModelPath ?? process.env.WHISPER_MODEL_PATH ?? '';
    this.piperBinPath =
      options.piperBinPath ?? process.env.PIPER_BIN_PATH ?? '/usr/bin/piper';
    this.piperModelPath =
      options.piperModelPath ?? process.env.PIPER_MODEL_PATH ?? '';
    this.ffmpegBinPath =
      options.ffmpegBinPath ?? process.env.FFMPEG_BIN_PATH ?? 'ffmpeg';
    this.timeoutMs = Number.isFinite(options.timeoutMs)
      ? Number(options.timeoutMs)
      : 30_000;
  }

  /**
   * Transcribes audio via local whisper.cpp binary after converting to 16kHz mono WAV.
   * @param {Buffer} buffer
   * @param {string} [_mimeType='audio/ogg']
   */
  async transcribe(buffer, _mimeType = 'audio/ogg') {
    if (!buffer || buffer.length === 0) {
      return {
        ok: false,
        text: '',
        provider: 'whisper-local',
        fallbackMessage: FALLBACK_STT_MESSAGE,
        error: 'EMPTY_AUDIO_BUFFER',
      };
    }

    if (!fs.existsSync(this.whisperBinPath)) {
      return {
        ok: false,
        text: '',
        provider: 'whisper-local',
        fallbackMessage: FALLBACK_STT_MESSAGE,
        error: `WHISPER_BIN_NOT_FOUND: ${this.whisperBinPath}`,
      };
    }

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autonmax-stt-'));
    const inputPath = path.join(tmpDir, 'input.audio');
    const wavPath = path.join(tmpDir, 'input.wav');

    try {
      fs.writeFileSync(inputPath, buffer);
      await execFileAsync(
        this.ffmpegBinPath,
        ['-y', '-i', inputPath, '-ar', '16000', '-ac', '1', wavPath],
        { timeout: this.timeoutMs }
      );

      const args = ['-f', wavPath, '-l', 'pt', '--no-timestamps'];
      if (this.whisperModelPath) {
        args.unshift('-m', this.whisperModelPath);
      }

      const { stdout } = await execFileAsync(this.whisperBinPath, args, {
        timeout: this.timeoutMs,
      });
      const text = String(stdout || '').trim();
      if (!text) {
        return {
          ok: false,
          text: '',
          provider: 'whisper-local',
          fallbackMessage: FALLBACK_STT_MESSAGE,
          error: 'EMPTY_WHISPER_OUTPUT',
        };
      }

      return { ok: true, text, provider: 'whisper-local' };
    } catch (err) {
      return {
        ok: false,
        text: '',
        provider: 'whisper-local',
        fallbackMessage: FALLBACK_STT_MESSAGE,
        error: err?.message || 'LOCAL_STT_FAILED',
      };
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  /**
   * Synthesizes speech using Piper TTS piped through ffmpeg into `audio/ogg; codecs=opus`.
   * @param {string} text
   * @param {{ voiceId?: string, speed?: number }} [options]
   */
  async synthesize(text, options = {}) {
    if (!fs.existsSync(this.piperBinPath)) {
      return {
        ok: false,
        buffer: Buffer.alloc(0),
        mimeType: 'audio/ogg; codecs=opus',
        error: `PIPER_BIN_NOT_FOUND: ${this.piperBinPath}`,
      };
    }

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autonmax-tts-'));
    const wavPath = path.join(tmpDir, 'speech.wav');
    const oggPath = path.join(tmpDir, 'speech.ogg');

    try {
      const piperArgs = ['--output_file', wavPath];
      const model = options.voiceId || this.piperModelPath;
      if (model) piperArgs.push('--model', model);

      await new Promise((resolve, reject) => {
        const proc = spawn(this.piperBinPath, piperArgs, { stdio: ['pipe', 'ignore', 'pipe'] });
        let stderr = '';
        const timer = setTimeout(() => {
          proc.kill('SIGKILL');
          reject(new Error('PIPER_TIMEOUT'));
        }, this.timeoutMs);
        if (typeof timer.unref === 'function') timer.unref();

        proc.stderr.on('data', (chunk) => {
          stderr += String(chunk);
        });
        proc.on('error', (err) => {
          clearTimeout(timer);
          reject(err);
        });
        proc.on('close', (code) => {
          clearTimeout(timer);
          if (code === 0) resolve();
          else reject(new Error(`Piper exit ${code}: ${stderr.slice(0, 150)}`));
        });

        proc.stdin.write(String(text || ''));
        proc.stdin.end();
      });

      await execFileAsync(
        this.ffmpegBinPath,
        ['-y', '-i', wavPath, '-c:a', 'libopus', '-b:a', '32k', oggPath],
        { timeout: this.timeoutMs }
      );

      const oggBuffer = fs.readFileSync(oggPath);
      return {
        ok: true,
        buffer: oggBuffer,
        mimeType: 'audio/ogg; codecs=opus',
      };
    } catch (err) {
      return {
        ok: false,
        buffer: Buffer.alloc(0),
        mimeType: 'audio/ogg; codecs=opus',
        error: err?.message || 'LOCAL_TTS_FAILED',
      };
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }
}

module.exports = { LocalVoiceAdapter };
