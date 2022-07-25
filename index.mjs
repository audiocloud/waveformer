import { Worker, Queue } from "bullmq";
import { temporaryFileTask } from "tempy";
import { nanoid } from "nanoid";
import { serializeError } from "serialize-error";
import ffprobe from 'ffprobe'
import ffprobeStatic from 'ffprobe-static'
import Axios from "axios";
import wmatch from "wildcard-match";
import body_parser from "body-parser";
import cors from "cors";
import Redis from "ioredis";
import child from "child_process";
import fs from "fs";
import Express from "express";
import process from "process";

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
      bit_depth,
      context,
    } = job.data;

    await temporaryFileTask(
      async (input_loc) => {
        await temporaryFileTask(
          async (output_loc) => {
            await download(input_url, input_loc);
            await generate_peaks(
              input_loc,
              input_format,
              channel_mode,
              output_format,
              bit_depth,
              output_loc
            );

            // get fileMeta into context
            context.fileMeta = await get_metadata(input_loc)

            await upload(output_loc, output_url);
          },
          { extension: output_format }
        );
      },
      { extension: input_format }
    );

    await notify(notify_url, job.id, context, null);
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

  const ffprobeResult = ffprobe(input_loc, { path: ffprobeStatic.path })
    .then(function(info) {
      console.log(info);

      // Requiring stream 0 to be an audio stream
      if (info.streams[0].codec_type === 'audio') {

        return {
          codecName: info.streams[0].codec_name,
          codecTagString: info.streams[0].codec_tag_string,
          sampleRate: info.streams[0].sample_rate,
          channels: info.streams[0].channels,
          bitDepth: info.streams[0].bits_per_sample,
          length: info.streams[0].duration,
          container: info.streams[0].container
        }

      } else {
        throw Error('Stream 0 is not an audio stream.')
      }
    })
    .catch(function (err) {
      console.error(err);
    })

  return ffprobeResult
}

async function notify(url, id, context, err) {
  console.log("notifying");
  console.table({ url, id, context, err });

  await axios.post(url, {
    err: err ? serializeError(err) : null,
    context,
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
    bit_depth,
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

  if (bit_depth !== 8 && bit_depth !== 16) {
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
        bit_depth,
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
