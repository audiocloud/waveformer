import { Agenda } from "agenda";
import { temporaryFileTask } from "tempy";
import { nanoid } from "nanoid";
import { serializeError } from "serialize-error";
import Axios from "axios";
import wmatch from "wildcard-match";
import body_parser from "body-parser";
import cors from "cors";
import child from "child_process";
import fs from "fs";
import Express from "express";
import process from "process";
import { exec } from "child_process";
import { promisify } from "util";

const app = Express();
const axios = Axios;
const port = process.env.PORT || 3000;

if (process.env.MONGO_CONNECTION_STRING === undefined) throw Error('MongoDB connection string missing.')
const agenda = new Agenda({ db: { address: process.env.MONGO_CONNECTION_STRING } });

agenda.on('start', (job) => {
  console.log(`Starting job '${job.attrs.name}' with id: ${job.attrs.data.job_id}`)
})

agenda.on('complete', (job) => {
  console.log(`Completed job '${job.attrs.name}' with id: ${job.attrs.data.job_id}`)
})

agenda.on('fail', (err, job) => {
  console.log('Error:', err)
  console.log('Job:', job)
  console.log(`Failed job '${job.attrs.name}' with id: ${job.attrs.data.job_id}`)
})

agenda.on('error', (error) => {
  throw Error(error)
})

agenda.define("waveform", async (job) => {
  console.log('--------------------------------------------');
  console.log("Waveforming:");
  console.log({ ...job.attrs.data, id: job.attrs.data.job_id });

  const {
    job_id,
    input_url,
    input_format,
    output_url,
    output_format,
    channel_mode,
    notify_url,
    awf_bit_depth,
    context,
  } = job.attrs.data;

  const meta = {}

  await temporaryFileTask(
    async (input_loc) => {
      await temporaryFileTask(
        async (output_loc) => {
          await download(input_url, input_loc);
          console.log('------------ Download finished ------------')
          const {
            sample_rate,
            channels,
            bit_depth,
            duration,
            duration_in_samples,
            time_base,
            format_name,
            codec_name
          } = await get_metadata(input_loc);

          meta.sample_rate = sample_rate;
          meta.channels = channels;
          meta.bit_depth = bit_depth;
          meta.duration = duration;
          meta.duration_in_samples = duration_in_samples;
          meta.time_base = time_base;
          meta.format_name = format_name;
          meta.codec_name = codec_name;

          console.log('---------------- Meta set -----------------')

          await generate_peaks(
            input_loc,
            input_format,
            channel_mode,
            output_format,
            awf_bit_depth,
            output_loc
          );

          await upload(output_loc, output_url);
        },
        { extension: output_format }
      );
    },
    { extension: input_format }
  );

  await notify(notify_url, job_id, context, meta, null);
});

// start agenda

(async function () {
  // IIFE to give access to async/await
  await agenda.start();
})();

async function upload(path, url) {
  console.log('--------------------------------------------');
  console.log("Uploading:");
  console.log({ path, url });
  await axios({
    url,
    method: "put",
    data: fs.createReadStream(path),
    headers: { "content-type": "application/octet-stream" },
  });
}

async function download(url, path) {
  console.log('--------------------------------------------');
  console.log("Downloading:");
  console.log({ url, path });

  const source = await axios.get(url, { responseType: "stream" });
  const writer = fs.createWriteStream(path);
  source.data.pipe(writer);

  return new Promise((resolve, reject) => {
    let error = null;
    writer.on("error", (err) => {
      error = err;
      writer.close();
      reject(err);
    });

    writer.on("finish", () => {
      if (!error) {
        resolve(true);
      }
    });
  });
}

function generate_peaks(
  input_loc,
  input_format,
  channel_mode,
  output_format,
  bit_depth,
  output_loc
) {
  console.log('--------------------------------------------');
  console.log("Generating peaks:");
  console.table({
    input_loc,
    input_format,
    channel_mode,
    output_format,
    bit_depth,
    output_loc,
  });

  const args = [
    "--input-format",
    input_format,
    "--output-format",
    output_format,
    "-b",
    bit_depth,
    "-i",
    input_loc,
    "-o",
    output_loc,
  ];

  if (channel_mode == "multi") {
    args.unshift("--split-channels");
  }

  const awf = child.spawn("audiowaveform", args);

  return new Promise((resolve, reject) => {
    awf.on("exit", (code) => {
      if (code) {
        reject("Exited with non-zero code: " + code);
      } else {
        resolve();
      }
    });
    awf.on("error", reject);
  });
}

async function get_metadata (input_loc) {
  console.log('--------------------------------------------');
  console.log("Getting file metadata...");

  const promisifyExec = promisify(exec)

  const { stdout, stderr } = await promisifyExec(`ffprobe -print_format json -show_format -show_streams -select_streams a -i ${input_loc}`);
  
  const ffprobe_result = JSON.parse(stdout)
  console.log('--------------------------------------------')
  console.log('ffprobe_result:', ffprobe_result)
  console.log('--------------------------------------------')

  if (ffprobe_result.streams.length < 1) {
    throw Error('No audio streams found.')

  } else {

    const meta = {
      sample_rate:          parseInt(ffprobe_result.streams[0].sample_rate),
      channels:             ffprobe_result.streams[0].channels,
      duration:             parseFloat(ffprobe_result.streams[0].duration),
      time_base:            ffprobe_result.streams[0].time_base,
      format_name:          ffprobe_result.format.format_name,
      codec_name:           ffprobe_result.streams[0].codec_name,
      size:                 parseInt(ffprobe_result.format.size)
    }
    
    if (ffprobe_result.streams[0].bits_per_sample === 0) meta.bit_depth = null
    else meta.bit_depth = ffprobe_result.streams[0].bits_per_sample

    meta.duration_in_samples = Number(BigInt(ffprobe_result.streams[0].duration_ts) * BigInt(meta.sample_rate) / BigInt(meta.time_base.split('/').pop()))

    const allowedFormatNames = ['flac', 'wav', 'mp3']
    const allowedCodecNames = ['flac', 'pcm_s16le', 'pcm_s16be', 'pcm_s24le', 'pcm_s32le', 'pcm_f32le', 'mp3']

    if (meta.channels > 2) throw Error('More than 2 channels not allowed.')
    if (!allowedFormatNames.find(element => element === meta.format_name)) throw Error(`Bad format: ${meta.format_name}`)
    if (!allowedCodecNames.find(element => element === meta.codec_name)) throw Error(`Bad codec: ${meta.codec_name}`)

    console.log('--------------------------------------------');
    console.log('Meta:', meta)

    return meta
  }
}

async function notify(url, id, context, meta, err) {
  console.log('--------------------------------------------');
  console.log("Notifying:");
  console.log({ url, id, context, err });

  await axios.post(url, {
    err: err ? serializeError(err) : null,
    context,
    meta,
    id,
  });
}

const is_domain_valid = wmatch(
  (process.env.VALID_URL_DOMAINS || "*").split(",")
)

function is_url_valid(url) {
  const parsed = new URL(url);
  return is_domain_valid(parsed.host);
}

app.use(body_parser.json());
app.use(cors());

app.post("/v1/create", (req, res, next) => {
  const {
    input_url,
    input_format,
    output_format,
    output_url,
    channel_mode,
    bit_depth: awf_bit_depth,
    notify_url,
    context,
  } = req.body;
  if (
    input_format !== "wav" &&
    input_format !== "flac" &&
    input_format !== "mp3"
  ) {
    throw new Error("Input format is not valid");
  }

  if (output_format !== "dat" && output_format !== "json") {
    throw new Error("Output format is not valid");
  }

  if (!input_url || !is_url_valid(input_url)) {
    throw new Error("Input URL is not valid");
  }

  if (!output_url || !is_url_valid(output_url)) {
    throw new Error("Output peaks URL is not valid");
  }

  if (!notify_url || !is_url_valid(notify_url)) {
    throw new Error("Notify URL is not valid");
  }

  if (channel_mode !== "single" && channel_mode !== "multi") {
    throw new Error("Channel mode is not valid");
  }

  if (awf_bit_depth !== 8 && awf_bit_depth !== 16) {
    throw new Error("Bit depth is not valid");
  }

  agenda.schedule(
    new Date().toISOString(),
    'waveform',
    {
      job_id: nanoid(),
      input_url,
      input_format,
      output_format,
      channel_mode,
      awf_bit_depth,
      output_url,
      notify_url,
      context,
    }
  ).then(job => res.status(200).json({
      success: true,
      job: job
    })
  ).catch(next);

});

app.listen(port, () => {
  console.log(`👋 Express application listening on port ${port}!`);
});
