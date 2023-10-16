import 'dotenv/config'
import { Agenda } from '@hokify/agenda'
import { v4 as uuid_v4 } from 'uuid'
import body_parser from 'body-parser'
import cors from 'cors'
import Express from 'express'
import process from 'process'
import { Logger } from './utils/logger.js'
import { handleInputValidation } from './utils/handleInputValidation.js'
import { BodyValidationSchema } from './types/index.js'
import { waveform_job_processor } from './waveform_job_processor.js'
import { getErrorMessage } from './utils/getErrorMessage.js'

const logger = new Logger('waveformer')

const app = Express()
const PORT = process.env.PORT || 3000

if (process.env.MONGO_CONNECTION_STRING === undefined) throw Error('MongoDB connection string missing.')
const agenda = new Agenda({ db: { address: process.env.MONGO_CONNECTION_STRING } })

agenda.on('start', (job) => {
  logger.info(`Starting job '${job.attrs.name}' with id: ${(job.attrs.data as any).job_id}`)
})

agenda.on('complete', (job) => {
  logger.info(`Completed job '${job.attrs.name}' with id: ${(job.attrs.data as any).job_id}`)
})

agenda.on('fail', (error, job) => {
  logger.warn('Error:', error.name)
  logger.warn('Message:', error.message)
  logger.warn(`Failed job '${job.attrs.name}' with id: ${(job.attrs.data as any).job_id}`)
})

agenda.on('error', (error) => {
  logger.error('Error:', error.name)
  logger.error('Message:', error.message)
  throw Error(error.message)
})

agenda.define('waveform', waveform_job_processor); // The ';' is needed for the following IIFE

(async function () {
  // IIFE to give access to async/await
  await agenda.start()
})()

app.use(body_parser.json())
app.use(cors())

app.post('/v1/create', (req, res, next) => {

  const timestamp = new Date().toISOString()
  const parameters = handleInputValidation(BodyValidationSchema, req.body)
  const data = { job_id: uuid_v4(), ...parameters }

  agenda
    .schedule(timestamp, 'waveform', data)
    .then(job => res.status(200).json({
      success: true,
      job: job
    }))
    // Requires testing
    .catch((error) => {
      res.status(500).json({
        success: false,
        message: getErrorMessage(error)
      })
    })

})

app.listen(PORT, () => {
  logger.info(`👋 Express application listening on port ${PORT}!`)
})
