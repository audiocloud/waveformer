import { Job } from '@hokify/agenda'
import { Logger } from './utils/logger.js'
import { handleInputValidation } from './utils/handleInputValidation.js'
import { JobDataValidationSchema } from './types/index.js'
import { download } from './helpers/download.js'
import { get_metadata } from './helpers/get_metadata.js'
import { generate_peaks } from './helpers/generate_peaks.js'
import { upload } from './helpers/upload.js'
import { notify } from './helpers/notify.js'

const logger = new Logger('waveformer/waveform_job_processor')

export const waveform_job_processor = async (job: Job<any>) => {

  logger.info('Job data:', { ...job.attrs.data, job_id: job.attrs.data.job_id })

  const {
    job_id,
    input_url,
    input_format,
    output_url,
    output_format,
    channel_mode,
    notify_url,
    bit_depth,
    context,
  } = handleInputValidation(JobDataValidationSchema, job.attrs.data)

  await import('tempy').then(async ({ temporaryFileTask }) => { await temporaryFileTask(
    async (input_loc) => {
      await temporaryFileTask(
        async (output_loc) => {

          const download_response = await download(input_url, input_loc)
          if (!download_response.success) throw Error(download_response.message)

          const ffprobe_meta = await get_metadata(input_loc)
          if (!ffprobe_meta.success) throw Error(ffprobe_meta.message)

          const awf_response = await generate_peaks({ input_loc, input_format, channel_mode, output_format, bit_depth: ffprobe_meta.meta.bit_depth, output_loc })
          if (!awf_response.success) throw Error(`AWF error: ${awf_response.message}`)

          const upload_response = await upload(output_loc, output_url)
          if (!upload_response.success) throw Error(`Upload error: ${upload_response.message}`)

          await notify(notify_url, job_id, context, ffprobe_meta.meta, null)

        },
        { extension: output_format }
      )
    },
    { extension: input_format }
  )})
}