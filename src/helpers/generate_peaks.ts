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

export const generate_peaks = ({ input_loc, input_format, channel_mode, output_format, bit_depth, output_loc }: Props): Promise<{ success: boolean, message: string }> => {
  return new Promise(async (resolve, reject) => {
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

      logger.info('Running: audiowaveform ' + args.join(' '))
      const awf = child.spawn('audiowaveform', args)

      awf.on('exit', (code, signal) => {
        logger.info('AWF code:', typeof code === 'number' ? code : 'null')
        logger.info('Signal:', signal)
        if (code === 0) {
          resolve({
            success: true,
            message: 'Peaks data generated.'
          })
        } else {
          reject({
            success: false,
            message: `Exited with non-zero code: ${code}`
          })
        }
      })

      awf.on('error', (error) => {
        const message = getErrorMessage(error)
        logger.error(message)
        reject({
          success: false,
          message
        })
      })

    } catch (error) {
      const message = getErrorMessage(error)
      logger.error(message)
      reject({
        success: false,
        message
      })
    }
  })
}

