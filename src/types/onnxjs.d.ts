declare module 'onnxjs' {
  export class InferenceSession {
    load(modelPath: string): Promise<void>;
    run(inputs: Record<string, Tensor>): Promise<Record<string, Tensor>>;
  }

  export class Tensor {
    constructor(data: Float32Array | Int32Array | Int64Array, dataType: string, shape: number[]);
    data: Float32Array | Int32Array | Int64Array;
    shape: number[];
    dataType: string;
  }
}