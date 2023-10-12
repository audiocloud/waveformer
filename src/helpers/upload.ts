import axios from 'axios'
import fs from 'fs'
import { Logger } from '../utils/logger'
import { getErrorMessage } from '../utils/getErrorMessage'

const logger = new Logger('waveformer/upload')

export async function upload(sourcePath: string, destinationUrl: string) {
  try {

    logger.info('Uploading:', { sourcePath, destinationUrl })

    const { status, statusText, data } = await axios.put(destinationUrl, fs.createReadStream(sourcePath), { headers: { 'content-type': 'application/octet-stream' }})
    logger.info('Status:', status)
    if (status !== 200) throw Error(statusText)

    return {
      success: true,
      message: 'Upload success.'
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