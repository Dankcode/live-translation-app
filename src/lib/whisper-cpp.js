// Backward-compatible import surface. The live engine is implemented in the
// compiler-free local Node transcription module.
export {
  buildWhisperJobPlan,
  getWhisperStatus,
  lingoloopPaths,
  runWhisperJob,
  transformerOutputToCues,
} from './local-transcription';
