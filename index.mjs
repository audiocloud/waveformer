import { Worker, Queue } from "bullmq";
import { temporaryFileTask } from "tempy";
import { nanoid } from "nanoid";
import { serializeError } from "serialize-error";
import Axios from "axios";
import wmatch from "wildcard-match";
import body_parser from "body-parser";
import cors from "cors";
import Redis from "ioredis";
import child from "child_process";
import fs from "fs";
import Express from "express";
import process from "process";
import { exec } from "child_process";
import { promisify } from "util";

const app = Express();
const axios = Axios;
const job_name = "waveform";
const port = process.env.PORT || 3000;
const connection = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

const queue = new Queue(job_name, { connection });

const worker = new Worker(
  job_name,
  async (job) => {
    console.log("processing job");
    console.table({ ...job.data, id: job.id });

    const {
      input_url,
      input_format,
      output_url,
      output_format,
      channel_mode,
      notify_url,
      awf_bit_depth,
      context,
    } = job.data;

    const meta = {}

    await temporaryFileTask(
      async (input_loc) => {
        await temporaryFileTask(
          async (output_loc) => {
            await download(input_url, input_loc);
            
            console.log('----- download finished -----')
            const {
              codec_name,
              format_name,
              sample_rate,
              bit_depth,
              channels,
              duration,
              duration_in_samples,
              time_base,
            } = await get_metadata(input_loc);

            meta.codec_name = codec_name;
            meta.format_name = format_name;
            meta.sample_rate = sample_rate;
            meta.bit_depth = bit_depth;
            meta.channels = channels;
            meta.duration = duration;
            meta.duration_in_samples = duration_in_samples;
            meta.time_base = time_base;

            console.log('----- meta set -----')

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

    await notify(notify_url, job.id, context, meta, null);
  },
  { concurrency: parseInt(process.env.CONCURRENCY || "10"), connection }
);

worker.on("failed", (job, error) => {
  console.log({ job, error });
  notify(job.data.notify_url, job.id, job.data.context, error).catch(() => {});
});

async function upload(path, url) {
  console.log("uploading");
  console.table({ path, url });
  await axios({
    url,
    method: "put",
    data: fs.createReadStream(path),
    headers: { "content-type": "application/octet-stream" },
  });
}

async function download(url, path) {
  console.log("downloading");
  console.table({ url, path });

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
  console.log("generating peaks");
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
  console.log("getting file metadata");

  const promisifyExec = promisify(exec)

  const { stdout, stderr } = await promisifyExec(`ffprobe -print_format json -show_format -show_streams -select_streams a -i ${input_loc}`);
  
  console.log('--------------------------------------------')
  // console.log('stdout:', stdout);
  // console.error('stderr:', stderr);
  
  console.log('--------------------------------------------')
  const full_meta = JSON.parse(stdout)
  
  console.log('full_meta:', full_meta)
  console.log('full_meta.streams.length:', full_meta.streams.length)
  
  console.log('--------------------------------------------')
  // reject if audio streams 0
  
  if (full_meta.streams.length < 1) {
    throw Error('No audio streams found.')

  } else {

    const meta = {
      codec_name:           full_meta.streams[0].codec_name,
      format_name:          full_meta.format.format_name,
      sample_rate:          parseInt(full_meta.streams[0].sample_rate),
      bit_depth:            full_meta.streams[0].bits_per_sample,
      channels:             full_meta.streams[0].channels,
      duration:             parseFloat(full_meta.streams[0].duration),
      time_base:            full_meta.streams[0].time_base
    }

    meta.duration_in_samples = Number(BigInt(full_meta.streams[0].duration_ts) * BigInt(meta.sample_rate) / BigInt(meta.time_base.split('/').pop()))

    const allowedFormatNames = ['flac', 'wav', 'mp3']
    const allowedCodecNames = ['flac', 'pcm_s16le', 'pcm_s16be', 'pcm_s24le', 'pcm_s32le', 'pcm_f32le', 'mp3']

    if (meta.channels > 2) throw Error('More than 2 channels not allowed.')
    if (!allowedFormatNames.find(element => element === meta.format_name)) throw Error(`Bad format: ${meta.format_name}`)
    if (!allowedCodecNames.find(element => element === meta.codec_name)) throw Error(`Bad codec: ${meta.codec_name}`)

    return meta
  }
}

async function notify(url, id, context, meta, err) {
  console.log("notifying");
  console.table({ url, id, context, err });

  await axios.post(url, {
    err: err ? serializeError(err) : null,
    context,
    meta,
    id,
  });
}

const is_domain_valid = wmatch(
  (process.env.VALID_URL_DOMAINS || "*").split(",")
);
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

  queue
    .add(
      new Date().toISOString(),
      {
        input_url,
        input_format,
        output_format,
        channel_mode,
        awf_bit_depth,
        output_url,
        notify_url,
        context,
      },
      { jobId: nanoid() }
    )
    .then((job) => res.json(job.id))
    .catch(next);
});

app.listen(port, () => {
  console.log(`👋 Express application listening on port ${port}!`);
});
