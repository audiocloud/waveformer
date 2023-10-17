import child from 'child_process'
import { TBitDepthWithNull, TChannelMode, TInputFormat, TOutputFormat } from '../types/index.js'
import { Logger } from '../utils/logger.js'
import { getErrorMessage } from '../utils/getErrorMessage.js'

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

    const args = [
      '--input-format',
      input_format,
      '--output-format',
      output_format,
      '-i',
      input_loc,
      '-o',
      output_loc
    ]

    const getMaxWaveformBitDepth = () => {
      if (bit_depth === null || bit_depth > 16) return 16
      return bit_depth
    }

    if (bit_depth) {
      args.push('-b')
      args.push(`${getMaxWaveformBitDepth()}`)
    }

    if (channel_mode === 'multi') args.push('--split-channels')

    logger.info('Generating: audiowaveform ' + args.join(' '))

    const awf = child.spawn('audiowaveform', args)

    await new Promise((resolve, reject) => {
      
      awf.on('error', (error) => {
        reject(error)
      })

      awf.on('exit', (code, signal) => {
        if (code === 0) resolve(true)
        else reject(typeof code === 'number' ? `Code: ${code}` : `Code: null, Signal: ${signal}`)
      })

    })

    return {
      success: true,
      message: 'Waveform generated.'
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