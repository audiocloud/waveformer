import axios from 'axios'
import fs from 'fs'
import { Logger } from '../utils/logger.js'
import { getErrorMessage } from '../utils/getErrorMessage.js'

const logger = new Logger('waveformer/download')

export const download = async (sourceUrl: string, destinationPath: string) => {
  try {
    
    logger.info('Downloading:', { sourceUrl, destinationPath })
  
    const { status, statusText, data: source } = await axios.get(sourceUrl, { responseType: 'stream' })
    logger.info('Status:', status)
    if (status !== 200) throw Error(statusText)
  
    const writer = fs.createWriteStream(destinationPath)
    source.pipe(writer)
  
    await new Promise((resolve, reject) => {
  
      let error: Error | null = null

      writer.on('error', (err) => {
        error = err
        writer.close()
        reject(err)
      })
      writer.on('finish', () => {
        if (!error) {
          writer.close()
          resolve(true)
        }
      })
    })

    return {
      success: true,
      message: 'Download finished!'
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