import child from 'child_process'
import { TBitDepthWithNull, TChannelMode, TInputFormat, TOutputFormat } from '../types'
import { Logger } from '../utils/logger'
import { getErrorMessage } from '../utils/getErrorMessage'

const logger = new Logger('waveformer/generate_peaks')

type Props = {
  input_loc: string,
  input_format: TInputFormat,
  channel_mode: TChannelMode,
  output_format: TOutputFormat,
  bit_depth: TBitDepthWithNull,
  output_loc: string
}

export const generate_peaks = async ({ input_loc, input_format, channel_mode, output_format, bit_depth, output_loc }: Props) => {
  try {
    
    logger.info('Generating peaks:', {
      input_loc,
      input_format,
      channel_mode,
      output_format,
      bit_depth,
      output_loc
    })
  
    const args = [
      '--input-format', input_format,
      '--output-format', output_format,
      '-i', input_loc,
      '-o', output_loc
    ]
  
    if (bit_depth) args.push(`-b ${bit_depth}`)
    if (channel_mode === 'multi') args.push('--split-channels')
  
    logger.info('Running: audiowaveform ' + args)
    const awf = child.spawn('audiowaveform', args)

    await new Promise<void>((resolve, reject) => {
  
      awf.on('error', (err) => reject(err))
      awf.on('exit', (code) => {
        if (code) reject('Exited with non-zero code: ' + code)
        else resolve()
      })
  
    })

    return {
      success: true,
      message: 'Peaks data generated.'
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