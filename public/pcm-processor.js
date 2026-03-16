class PcmProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0]?.[0];
    if (channel?.length) {
      const int16 = new Int16Array(channel.length);
      for (let i = 0; i < channel.length; i += 1) {
        int16[i] = Math.max(-32768, Math.min(32767, channel[i] * 32767));
      }
      this.port.postMessage(int16.buffer, [int16.buffer]);
    }
    return true;
  }
}

registerProcessor("pcm-processor", PcmProcessor);
