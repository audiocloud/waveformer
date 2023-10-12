import { Job } from '@hokify/agenda'
import { Logger } from './utils/logger'
import { handleInputValidation } from './utils/handleInputValidation'
import { JobDataValidationSchema } from './types'
import { temporaryFileTask } from 'tempy'
import { download } from './helpers/download'
import { get_metadata } from './helpers/get_metadata'
import { generate_peaks } from './helpers/generate_peaks'
import { upload } from './helpers/upload'
import { notify } from './helpers/notify'

const logger = new Logger('waveformer/waveform_job_processor')

export const waveform_job_processor = async (job: Job<any>) => {
  
  logger.info('Job data:', { ...job.attrs.data, id: job.attrs.data.job_id })

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

  await temporaryFileTask(
    async (input_loc) => {
      await temporaryFileTask(
        async (output_loc) => {

          const download_response = await download(input_url, input_loc)
          if (!download_response.success) throw Error(download_response.message)

          const ffprobe_meta = await get_metadata(input_loc)
          if (!ffprobe_meta.success) throw Error(ffprobe_meta.message)

          await generate_peaks({ input_loc, input_format, channel_mode, output_format, bit_depth: ffprobe_meta.meta.bit_depth, output_loc })

          const { success, message } = await upload(output_loc, output_url)
          if (!success) throw Error(`Upload error: ${message}`)

          await notify(notify_url, job_id, context, ffprobe_meta.meta, null)

        },
        { extension: output_format }
      )
    },
    { extension: input_format }
  )
}