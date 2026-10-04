const { exec } = require('child_process');
const ffmpegCmd = `ffmpeg -y -loop 1 -framerate 30 -t 10 -i "test.jpg" -filter_complex "[0:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1[v0]; [v0]concat=n=1:v=1:a=0[v]" -map "[v]" -pix_fmt yuv420p -c:v libx264 -crf 28 -preset veryfast "test.mp4"`;
console.log(ffmpegCmd);
exec(ffmpegCmd, (err, stdout, stderr) => {
  if (err) console.error("Error:", stderr);
  else console.log("Success");
});
