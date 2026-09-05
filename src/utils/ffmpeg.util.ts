import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';
import path from 'path';
import fs from 'fs';

// Set the paths to the installed binaries
ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

export const generateHLS = async (inputPath: string, outputDir: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const masterPlaylistPath = path.join(outputDir, 'master.m3u8');

    // Probe the file to check for audio
    ffmpeg.ffprobe(inputPath, (probeErr, metadata) => {
      if (probeErr) {
        console.error('ffprobe error:', probeErr);
        return reject(probeErr);
      }

      const hasAudio = metadata.streams.some(s => s.codec_type === 'audio');

      let command = ffmpeg(inputPath, { timeout: 432000 })
        .addOptions([
          '-profile:v:0 main',
          '-profile:v:1 main',
          '-profile:v:2 main',
          '-profile:v:3 main',
          '-profile:v:4 main',
        ])
        // 1080p
        .addOption('-map', '0:v:0')
        .addOption('-s:v:0', '1920x1080')
        .addOption('-c:v:0', 'libx264')
        .addOption('-b:v:0', '3000k')
        // 720p
        .addOption('-map', '0:v:0')
        .addOption('-s:v:1', '1280x720')
        .addOption('-c:v:1', 'libx264')
        .addOption('-b:v:1', '1500k')
        // 480p
        .addOption('-map', '0:v:0')
        .addOption('-s:v:2', '854x480')
        .addOption('-c:v:2', 'libx264')
        .addOption('-b:v:2', '1000k')
        // 360p
        .addOption('-map', '0:v:0')
        .addOption('-s:v:3', '640x360')
        .addOption('-c:v:3', 'libx264')
        .addOption('-b:v:3', '800k')
        // 240p
        .addOption('-map', '0:v:0')
        .addOption('-s:v:4', '426x240')
        .addOption('-c:v:4', 'libx264')
        .addOption('-b:v:4', '400k');

      if (hasAudio) {
        command = command
          .addOption('-map', '0:a:0')
          .addOption('-map', '0:a:0')
          .addOption('-map', '0:a:0')
          .addOption('-map', '0:a:0')
          .addOption('-map', '0:a:0')
          .addOption('-c:a', 'aac')
          .addOption('-b:a', '128k')
          .addOption('-var_stream_map', 'v:0,a:0 v:1,a:1 v:2,a:2 v:3,a:3 v:4,a:4');
      } else {
        command = command
          .addOption('-var_stream_map', 'v:0 v:1 v:2 v:3 v:4');
      }

      command
        .addOption('-f', 'hls')
        .addOption('-hls_time', '4')
        .addOption('-hls_playlist_type', 'vod')
        .addOption('-hls_flags', 'independent_segments')
        .addOption('-hls_segment_type', 'mpegts')
        .outputOptions('-hls_segment_filename', path.join(outputDir, '%v_data%03d.ts'))
        .output(path.join(outputDir, '%v.m3u8'))
        .on('end', () => {
          try {
            // Older FFmpeg versions crash when trying to write master.m3u8 using -master_pl_name on Windows.
            // They also output variants as 0.m3u8, 1.m3u8, etc. 
            // We manually rename the variant playlists and generate the master playlist here.
            
            const variantConfigs = [
              { name: '1080p', bw: 3000000, res: '1920x1080' },
              { name: '720p', bw: 1500000, res: '1280x720' },
              { name: '480p', bw: 1000000, res: '854x480' },
              { name: '360p', bw: 800000, res: '640x360' },
              { name: '240p', bw: 400000, res: '426x240' }
            ];

            let masterContent = "#EXTM3U\n#EXT-X-VERSION:3\n";
            
            variantConfigs.forEach((config, index) => {
              const oldName = `${index}.m3u8`;
              const newName = `${config.name}.m3u8`;
              
              const oldFilePath = path.join(outputDir, oldName);
              const newFilePath = path.join(outputDir, newName);
              
              if (fs.existsSync(oldFilePath)) {
                fs.renameSync(oldFilePath, newFilePath);
                masterContent += `#EXT-X-STREAM-INF:BANDWIDTH=${config.bw},RESOLUTION=${config.res}\n${newName}\n`;
              }
            });
            
            fs.writeFileSync(masterPlaylistPath, masterContent);
          } catch (e) {
            console.error('Error renaming variant playlists or writing master:', e);
          }
          resolve(masterPlaylistPath);
        })
        .on('error', (err, stdout, stderr) => {
          console.error('Error generating HLS:', err);
          console.error('ffmpeg stderr:', stderr);
          reject(err);
        })
        .run();
    });
  });
};

export const generateThumbnail = async (inputPath: string, outputDir: string, filename: string = 'thumbnail.jpg'): Promise<string> => {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    ffmpeg(inputPath)
      .on('end', () => resolve(path.join(outputDir, filename)))
      .on('error', (err) => reject(err))
      .screenshots({
        count: 1,
        folder: outputDir,
        filename: filename,
        timestamps: ['00:00:01.000'] // take screenshot at 1 second
      });
  });
};
