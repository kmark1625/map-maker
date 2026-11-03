import { WebWorkerMLCEngineHandler } from "@mlc-ai/web-llm";

// The whole LLM engine (model download, WebGPU inference) lives in this
// worker. The map editor's main thread only exchanges messages with it,
// so painting, panning, and rendering never block on token generation.
const handler = new WebWorkerMLCEngineHandler();
self.onmessage = handler.onmessage.bind(handler);
