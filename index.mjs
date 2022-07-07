import { Worker, Queue } from "bullmq";
import { temporaryFileTask } from "tempy";
import Axios from "axios";
import wmatch from "wildcard-match";
import body_parser from "body-parser";
import cors from "cors";
import Redis from "ioredis";
import child from "child_process";
import fs from "fs";
import Express from "express";
import process from "process";
import { resolve } from "path";

const app = Express();
const connection = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
});
const axios = Axios;
const job_name = "waveform";
const PORT = process.env.PORT || 3000;

const queue = new Queue(job_name, { connection });

const worker = new Worker(
  job_name,
  async (job) => {
    console.log("processing job");
    console.table({ ...job.data, id: job.id });

    const { wav_url, peaks_url, notify_url } = job.data;
    await temporaryFileTask(
      async (wav_loc) => {
        await temporaryFileTask(
          async (peaks_loc) => {
            await download(wav_url, wav_loc);
            await generate_peaks(wav_loc, peaks_loc);
            await upload(peaks_loc, peaks_url);
          },
          { extension: "dat" }
        );
      },
      { extension: "wav" }
    );

    await notify(notify_url);
  },
  { concurrency: parseInt(process.env.CONCURRENCY || "10"), connection }
);

worker.on("failed", (job, error) => {
  console.log({ job, error });
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

function generate_peaks(wav_loc, peaks_loc) {
  console.log("generating peaks");
  console.table({ wav_loc, peaks_loc });
  const awf = child.spawn("audiowaveform", [
    "--split-channels",
    "--output-format",
    "dat",
    "-i",
    wav_loc,
    "-o",
    peaks_loc,
  ]);

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

async function notify(url) {
  console.log("notifying", url);
  await axios.get(url);
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
  const { wav_url, peaks_url, notify_url } = req.body;
  if (!wav_url || !is_url_valid(wav_url)) {
    throw new Error("input WAV URL is not valid");
  }
  if (!peaks_url || !is_url_valid(peaks_url)) {
    throw new Error("Output peaks URL is not valid");
  }
  if (!notify_url || !is_url_valid(notify_url)) {
    throw new Error("Notify URL is not valid");
  }

  queue
    .add(new Date().toISOString(), { wav_url, peaks_url, notify_url })
    .then((job) => res.json(job.id))
    .catch(next);
});

app.listen(PORT, () => {
  console.log(`👋 Express application listening on port ${PORT}!`);
});
