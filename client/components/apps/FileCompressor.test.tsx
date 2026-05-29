/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FileCompressorApp } from './FileCompressor';

// Mock ResizeObserver
global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
};

// Mock supabase
const mockDownload = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: {
    storage: {
      from: vi.fn(() => ({
        download: mockDownload,
        remove: vi.fn().mockResolvedValue({ error: null }),
        upload: vi.fn().mockResolvedValue({ error: null }),
      })),
    },
  },
}));

// Mock FFmpeg
const mockLoad = vi.fn().mockResolvedValue(undefined);
const mockExec = vi.fn().mockResolvedValue(0);
vi.mock('@ffmpeg/ffmpeg', () => {
  class FFmpegMock {
    load = mockLoad;
    on = vi.fn();
    writeFile = vi.fn().mockResolvedValue(undefined);
    exec = mockExec;
    readFile = vi.fn().mockResolvedValue(new Uint8Array());
  }
  return { FFmpeg: FFmpegMock };
});

// Mock @ffmpeg/util
vi.mock('@ffmpeg/util', () => ({
  fetchFile: vi.fn(),
  toBlobURL: vi.fn().mockResolvedValue('blob:url'),
}));

// Mock browser-image-compression
vi.mock('browser-image-compression', () => ({
  __esModule: true,
  default: vi.fn(),
}));

// Mock StorageFileSelector
vi.mock('@/components/StorageFileSelector', () => ({
  StorageFileSelector: ({ onSelect, trigger }: any) => (
    <div onClick={() => onSelect({ name: 'test.mp3', metadata: { size: 1024, mimetype: 'audio/mpeg' } })}>
      {trigger}
    </div>
  ),
}));

describe('FileCompressorApp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoad.mockResolvedValue(undefined);
    mockDownload.mockResolvedValue({ data: new Blob(), error: null });
  });

  it('renders the file compressor app', () => {
    render(<FileCompressorApp />);
    expect(screen.getByText('Source File')).toBeDefined();
    expect(screen.getByText('Compression Settings')).toBeDefined();
    expect(screen.getByText('Status & Results')).toBeDefined();
  });

  it('handles audio compression and awaits FFmpeg loading', async () => {
    render(<FileCompressorApp />);

    // Select a file
    const selectors = screen.getAllByText('Click to select from storage');
    fireEvent.click(selectors[0]);

    expect(screen.getAllByText('test.mp3').length).toBeGreaterThan(0);

    // Start compression
    const startButtons = screen.getAllByText('Start Compression');
    fireEvent.click(startButtons[0]);

    await waitFor(() => {
      expect(mockLoad).toHaveBeenCalled();
      expect(mockExec).toHaveBeenCalled();
    }, { timeout: 2000 });

    expect(screen.getByText('Success!')).toBeDefined();
  });
});
