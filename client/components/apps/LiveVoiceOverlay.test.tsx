/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { LiveVoiceOverlay } from "./Chatbot/LiveVoiceOverlay";

describe("LiveVoiceOverlay component", () => {
  afterEach(() => {
    cleanup();
  });

  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    voiceState: "listening" as const,
    audioLevel: 0.5,
    interimTranscript: "Hello world",
    finalTranscript: "",
    lastAssistantText: "Welcome! How can I help you today?",
    isMuted: false,
    isHandsFree: true,
    isPushToTalkActive: false,
    errorMessage: null,
    availableVoices: [
      { name: "Google Voice", lang: "en-US", voiceURI: "google-voice-1" },
    ],
    selectedVoiceUri: "google-voice-1",
    speechRate: 1.0,
    speechPitch: 1.0,
    onToggleMute: vi.fn(),
    onToggleHandsFree: vi.fn(),
    onPushToTalkStart: vi.fn(),
    onPushToTalkEnd: vi.fn(),
    onInterrupt: vi.fn(),
    onSelectVoice: vi.fn(),
    onChangeRate: vi.fn(),
    onChangePitch: vi.fn(),
  };

  it("renders when isOpen is true", () => {
    render(<LiveVoiceOverlay {...defaultProps} />);
    expect(screen.getByRole("dialog")).toBeDefined();
    expect(screen.getByText(/Listening\.\.\./i)).toBeDefined();
    expect(screen.getByText(/"Hello world"/i)).toBeDefined();
  });

  it("does not render when isOpen is false", () => {
    render(<LiveVoiceOverlay {...defaultProps} isOpen={false} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("displays assistant text when voiceState is speaking", () => {
    render(
      <LiveVoiceOverlay
        {...defaultProps}
        voiceState="speaking"
        lastAssistantText="Here is what you asked for."
      />,
    );
    expect(screen.getByText(/"Here is what you asked for\."/i)).toBeDefined();
  });

  it("calls onToggleMute when mute button is clicked", () => {
    const onToggleMute = vi.fn();
    render(<LiveVoiceOverlay {...defaultProps} onToggleMute={onToggleMute} />);

    const muteBtn = screen.getByRole("button", { name: /^Mute$/i });
    fireEvent.click(muteBtn);
    expect(onToggleMute).toHaveBeenCalled();
  });

  it("calls onClose when close button is clicked", () => {
    const onClose = vi.fn();
    render(<LiveVoiceOverlay {...defaultProps} onClose={onClose} />);

    const closeBtns = screen.getAllByRole("button", { name: /End Live Chat/i });
    fireEvent.click(closeBtns[0]);
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onToggleHandsFree when mode toggle button is clicked", () => {
    const onToggleHandsFree = vi.fn();
    render(
      <LiveVoiceOverlay
        {...defaultProps}
        onToggleHandsFree={onToggleHandsFree}
      />,
    );

    const handsFreeBtn = screen.getByText(/Hands-Free/i);
    fireEvent.click(handsFreeBtn);
    expect(onToggleHandsFree).toHaveBeenCalled();
  });

  it("shows voice settings panel when settings icon is clicked", () => {
    render(<LiveVoiceOverlay {...defaultProps} />);

    const settingsBtn = screen.getByRole("button", { name: /Voice Settings/i });
    fireEvent.click(settingsBtn);

    expect(screen.getByText(/Select Voice/i)).toBeDefined();
    expect(screen.getByText(/Speed/i)).toBeDefined();
    expect(screen.getByText(/Pitch/i)).toBeDefined();
  });
});
