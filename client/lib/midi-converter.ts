type MidiTrack = {
  notes: Array<{
    pitch: number;
    startTime: number;
    duration: number;
  }>;
};

type ConvertedBlock = {
  type: "Sound" | "Wait";
  id?: string;
  speed?: number;
  start?: number;
  end?: number;
  duration?: number;
};

const ROBLOX_SOUND_IDS = [
  "233836579", // C/C#
  "233844049", // D/D#
  "233845680", // E/F
  "233852841", // F#/G
  "233854135", // G#/A
  "233856105", // A#/B
];

function parseMidiFile(arrayBuffer: ArrayBuffer): MidiTrack[] {
  const view = new Uint8Array(arrayBuffer);
  
  if (String.fromCharCode(...view.slice(0, 4)) !== "MThd") {
    throw new Error("Invalid MIDI file: missing MThd header");
  }

  let pos = 14;
  const format = view[8] << 8 | view[9];
  const numTracks = view[10] << 8 | view[11];
  const division = view[12] << 8 | view[13];

  const tracks: MidiTrack[] = [];

  for (let trackIdx = 0; trackIdx < numTracks; trackIdx++) {
    if (String.fromCharCode(...view.slice(pos, pos + 4)) !== "MTrk") {
      break;
    }

    pos += 4;
    const trackLength =
      (view[pos] << 24) | (view[pos + 1] << 16) | (view[pos + 2] << 8) | view[pos + 3];
    pos += 4;
    const trackEnd = pos + trackLength;

    const notes: MidiTrack["notes"] = [];
    const noteOnMap = new Map<number, number>();
    let currentTime = 0;

    while (pos < trackEnd) {
      const deltaTime = readVariableLength(view, pos);
      pos += getLengthOfVariableLength(view, pos);
      currentTime += deltaTime;

      const status = view[pos];
      pos++;

      if (status === 0xff) {
        const metaType = view[pos];
        pos++;
        const length = readVariableLength(view, pos);
        pos += getLengthOfVariableLength(view, pos);
        pos += length;
      } else if ((status & 0xf0) === 0x90) {
        const channel = status & 0x0f;
        const pitch = view[pos];
        const velocity = view[pos + 1];
        pos += 2;

        if (velocity > 0) {
          noteOnMap.set(pitch, currentTime);
        } else {
          const startTime = noteOnMap.get(pitch) ?? currentTime;
          noteOnMap.delete(pitch);
          const duration = currentTime - startTime;
          notes.push({ pitch, startTime, duration });
        }
      } else if ((status & 0xf0) === 0x80) {
        const pitch = view[pos];
        pos += 2;
        const startTime = noteOnMap.get(pitch) ?? currentTime;
        noteOnMap.delete(pitch);
        const duration = currentTime - startTime;
        notes.push({ pitch, startTime, duration });
      } else {
        const length = readVariableLength(view, pos);
        pos += getLengthOfVariableLength(view, pos);
        pos += length;
      }
    }

    if (notes.length > 0) {
      tracks.push({ notes });
    }
  }

  return tracks;
}

function readVariableLength(view: Uint8Array, pos: number): number {
  let value = 0;
  let byte = view[pos];

  while (byte & 0x80) {
    value = (value << 7) | (byte & 0x7f);
    pos++;
    byte = view[pos];
  }

  return (value << 7) | (byte & 0x7f);
}

function getLengthOfVariableLength(view: Uint8Array, pos: number): number {
  let length = 0;
  let byte = view[pos];

  while (byte & 0x80) {
    length++;
    pos++;
    byte = view[pos];
  }

  return length + 1;
}

function noteNumberToSoundInfo(noteNumber: number): { soundIndex: number; octave: number } {
  const noteInOctave = ((noteNumber % 12) + 1);
  const soundIndex = Math.ceil(noteInOctave / 2) - 1;
  const octave = Math.floor(noteNumber / 12);
  return { soundIndex: Math.max(0, Math.min(5, soundIndex)), octave };
}

function noteToTimeOffset(noteNumber: number, octave: number): number {
  const noteInOctave = ((noteNumber % 12) + 1);
  const offset = 16 * (octave - 1) + 8 * (1 - (noteInOctave % 2));
  const baseTime = offset + (octave - 0.9) / 15;
  return baseTime;
}

export function convertMidiToBlocks(arrayBuffer: ArrayBuffer, tempoMultiplier: number = 1): ConvertedBlock[] {
  const tracks = parseMidiFile(arrayBuffer);
  
  if (tracks.length === 0) {
    return [];
  }

  const track = tracks[0];
  
  const sortedNotes = [...track.notes].sort((a, b) => a.startTime - b.startTime);

  const blocks: ConvertedBlock[] = [];
  let lastEndTime = 0;

  for (const note of sortedNotes) {
    const { soundIndex, octave } = noteNumberToSoundInfo(note.pitch);
    const soundId = ROBLOX_SOUND_IDS[soundIndex];

    if (lastEndTime < note.startTime) {
      const waitDuration = ((note.startTime - lastEndTime) / 480) * tempoMultiplier;
      if (waitDuration > 0.01) {
        blocks.push({
          type: "Wait",
          duration: Math.round(waitDuration * 1000) / 1000,
        });
      }
    }

    const timeOffset = noteToTimeOffset(note.pitch, octave);
    const noteDuration = (note.duration / 480) * tempoMultiplier;
    
    blocks.push({
      type: "Sound",
      id: soundId,
      speed: 1,
      start: Math.round(timeOffset * 1000) / 1000,
      end: Math.round((timeOffset + noteDuration) * 1000) / 1000,
    });

    lastEndTime = note.startTime + note.duration;
  }

  return blocks;
}

export function blocksToCode(blocks: ConvertedBlock[]): string {
  const lines: string[] = [];

  for (const block of blocks) {
    if (block.type === "Sound") {
      lines.push(`Sound([${block.id}], ${block.speed}, ${block.start}, ${block.end})`);
    } else if (block.type === "Wait") {
      lines.push(`Wait(${block.duration})`);
    }
  }

  return lines.join("\n");
}
