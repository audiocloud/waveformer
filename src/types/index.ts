import { ZodType, z } from 'zod'
import { is_url_valid } from '../utils/is_url_valid'

const ALLOWED_INPUT_FORMATS = ['flac', 'wav', 'mp3'] as const
const ALLOWED_OUTPUT_FORMATS = ['dat', 'json'] as const
const ALLOWED_CHANNEL_MODES = ['single', 'multi'] as const
const ALLOWED_BIT_DEPTHS = [8, 16] as const
const ALLOWED_CHANNELS = [1, 2] as const
const ALLOWED_FORMAT_NAMES = ALLOWED_INPUT_FORMATS // this is for ffprobe output validation
const ALLOWED_CODEC_NAMES = ['flac', 'pcm_s16le', 'pcm_s16be', 'pcm_s24le', 'pcm_s32le', 'pcm_f32le', 'mp3'] as const

export interface AudioFileMeta {
  sample_rate: number,
  channels: TChannels,
  duration: number,
  time_base: string,
  format_name: TFormatName,
  codec_name: TCodecName,
  size: number,
  bit_depth: TBitDepthWithNull,
  duration_in_samples: number
}

export type TInputFormat = z.infer<typeof InputFormatSchema>
export type TOutputFormat = z.infer<typeof OutputFormatSchema>
export type TChannelMode = z.infer<typeof ChannelModeSchema>
export type TBitDepth = z.infer<typeof BitDepthSchema>
export type TChannels = z.infer<typeof ChannelsSchema>
export type TFormatName = z.infer<typeof FormatNameSchema>
export type TCodecName = z.infer<typeof CodecNameSchema>
export type TBitDepthWithNull = z.infer<typeof BitDepthWithNullSchema>

// For request body and job data validation

const InputFormatSchema = z.enum(ALLOWED_INPUT_FORMATS)
const OutputFormatSchema = z.enum(ALLOWED_OUTPUT_FORMATS)
const ChannelModeSchema = z.enum(ALLOWED_CHANNEL_MODES)
const BitDepthSchema = numericEnum(ALLOWED_BIT_DEPTHS)
const URLSchema = z.string().url().refine(url => is_url_valid(url), { message: 'Invalid domain.' })

export const BodyValidationSchema = z.object({
  input_url: URLSchema,
  input_format: InputFormatSchema,
  output_format: OutputFormatSchema,
  output_url: URLSchema,
  channel_mode: ChannelModeSchema,
  bit_depth: BitDepthSchema,
  notify_url: URLSchema,
  context: z.any()
}).strict()

export const JobDataValidationSchema = BodyValidationSchema.extend({
  job_id: z.string().min(1)
})

// For ffprobe parsed output data validation

const SampleRateSchema = z.number().min(1)
const ChannelsSchema = numericEnum(ALLOWED_CHANNELS)
const DurationSchema = z.number().min(0)
const TimeBaseSchema = z.string().min(1)
const FormatNameSchema = z.enum(ALLOWED_FORMAT_NAMES)
const CodecNameSchema = z.enum(ALLOWED_CODEC_NAMES)
const SizeSchema = z.number().min(1)
const BitDepthWithNullSchema = z.union([numericEnum(ALLOWED_BIT_DEPTHS), z.null()])
const DurationInSamplesSchema = z.number()

export const FfprobeParseValidationSchema = z.object({
  sample_rate: SampleRateSchema,
  channels: ChannelsSchema,
  duration: DurationSchema,
  time_base: TimeBaseSchema,
  format_name: FormatNameSchema,
  codec_name: CodecNameSchema,
  size: SizeSchema,
  bit_depth: BitDepthWithNullSchema,
  duration_in_samples: DurationInSamplesSchema
}).strict()

// Custom numeric enum

function numericEnum<TValues extends readonly number[]>(values: TValues) {
  return z.number().superRefine((val, ctx) => {
    if (!values.includes(val)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Invalid enum value. Expected ${values.join(' | ',)}, received ${val}`,
      })
    }
  }) as ZodType<TValues[number]>
}