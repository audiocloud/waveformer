import { exec } from 'child_process'
import { promisify } from 'util'
import { AudioFileMeta, FfprobeParseValidationSchema } from '../types/index.js'
import { Logger } from '../utils/logger.js'
import { handleInputValidation } from '../utils/handleInputValidation.js'
import { getErrorMessage } from '../utils/getErrorMessage.js'

const logger = new Logger('waveformer/get_metadata')

export const get_metadata = async (input_loc: string): Promise<{ success: true, meta: AudioFileMeta } | { success: false, message: string }> => {
  try {
    
    logger.info('Getting file metadata...')
  
    const promisifyExec = promisify(exec)
    const { stdout, stderr } = await promisifyExec(`ffprobe -print_format json -show_format -show_streams -select_streams a -i ${input_loc}`)
    const ffprobe_result = JSON.parse(stdout)
    
    logger.info('ffprobe_result:', ffprobe_result)
  
    if (ffprobe_result.streams.length < 1) throw Error('No audio streams found.')
  
    const getBitDepth = () => {
      if (ffprobe_result.streams[0].bits_per_sample === 0) return null
      return ffprobe_result.streams[0].bits_per_sample
    }
  
    const getDurationInSamples = () => {
      return Number(BigInt(ffprobe_result.streams[0].duration_ts) * BigInt(ffprobe_result.streams[0].sample_rate) / BigInt(ffprobe_result.streams[0].time_base.split('/').pop()))
    }
  
    const meta: AudioFileMeta = handleInputValidation(FfprobeParseValidationSchema, {
      sample_rate:          parseInt(ffprobe_result.streams[0].sample_rate),
      channels:             ffprobe_result.streams[0].channels,
      duration:             parseFloat(ffprobe_result.streams[0].duration),
      time_base:            ffprobe_result.streams[0].time_base,
      format_name:          ffprobe_result.format.format_name,
      codec_name:           ffprobe_result.streams[0].codec_name,
      size:                 parseInt(ffprobe_result.format.size),
      bit_depth:            getBitDepth(),
      duration_in_samples:  getDurationInSamples()
    })
  
    logger.info('Meta found:', meta)
  
    return {
      success: true,
      meta
    }
    
  } catch (error) {
    const message = getErrorMessage(error)
    logger.error(message)
    return {
      success: false,
      message
    }
  }
}