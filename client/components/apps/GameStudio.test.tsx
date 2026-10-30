// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import React from "react";
import { BrowserRouter } from "react-router-dom";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { GameStudioApp } from "./GameStudio";
import * as authHook from "@/hooks/useAuth";
import * as pollinationsClient from "@/services/pollinationsClient";

vi.mock("@/hooks/useAuth");

describe("GameStudioApp", () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    vi.spyOn(authHook, "useAuth").mockReturnValue({
      session: {
        access_token: "test-token",
        token_type: "bearer",
        user: { id: "1", username: "oxygenlow", role: "admin" },
      } as any,
      loading: false,
      signOut: vi.fn(),
    } as any);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  const renderApp = () =>
    render(
      <LanguageProvider>
        <BrowserRouter>
          <GameStudioApp />
        </BrowserRouter>
      </LanguageProvider>,
    );

  it("renders Conversational AI Game Director, Pollinations model dropdowns, and Live Preview sandbox", () => {
    renderApp();
    expect(screen.getByText("Game Studio")).toBeTruthy();
    expect(screen.getByText("AI Game Director")).toBeTruthy();
    expect(screen.getByLabelText("Code/Text Model")).toBeTruthy();
    expect(screen.getByLabelText("Art Model")).toBeTruthy();
    expect(screen.getByLabelText("Dimension")).toBeTruthy();
    expect(screen.getByTitle("Ember Ring")).toBeTruthy();
  });

  it("updates the game via Conversational Director Chat using Pollinations AI", async () => {
    vi.spyOn(pollinationsClient, "fetchPollinationsClient").mockResolvedValueOnce(
      "Here is your updated 3D space game!\n```html\n<!DOCTYPE html><html><body><canvas id='custom-3d'></canvas></body></html>\n```",
    );

    renderApp();

    const input = screen.getByPlaceholderText(
      /Describe a new game or tell the AI Director what to change/i,
    );
    fireEvent.change(input, {
      target: { value: "Make a 3D space exploration game" },
    });
    const sendBtn = screen.getByLabelText("Send to Director");
    fireEvent.click(sendBtn);

    await waitFor(() => {
      expect(pollinationsClient.fetchPollinationsClient).toHaveBeenCalled();
      expect(screen.getByText(/Here is your updated 3D space game!/i)).toBeTruthy();
    });
  });

  it("executes Pollinations asset generation tool calls (art, 3D models, SFX, music, voice TTS) from the LLM", async () => {
    vi.spyOn(pollinationsClient, "fetchPollinationsClient").mockResolvedValueOnce(
      `<tool_call>{"name": "generate_3d_model", "args": {"id": "star_cruiser", "name": "Star Cruiser 3D", "description": "Sleek low-poly spaceship", "parts": [{"shape": "cone", "position": [0,0,0], "scale": [1,2,1], "color": "#38bdf8"}]}}</tool_call>
<tool_call>{"name": "generate_sound_effect", "args": {"id": "warp_sfx", "name": "Warp Drive SFX", "waveform": "sawtooth", "startFreq": 220, "endFreq": 880, "duration": 0.3}}</tool_call>
<tool_call>{"name": "generate_music_track", "args": {"id": "galaxy_bgm", "name": "Galaxy Synth BGM", "bpm": 130, "waveform": "triangle", "notes": [261.63, 329.63, 392, 523.25]}}</tool_call>
<tool_call>{"name": "generate_voice_line", "args": {"id": "captain_intro", "name": "Captain Intro", "text": "All systems nominal!", "voice": "onyx"}}</tool_call>
<tool_call>{"name": "generate_art_asset", "args": {"id": "nebula_bg", "name": "Nebula Background", "role": "background", "prompt": "purple sci-fi space nebula"}}</tool_call>
I have generated your 3D Star Cruiser model, Warp Drive SFX, Galaxy BGM, Captain voice line, and Nebula background!`,
    );

    renderApp();

    const input = screen.getByPlaceholderText(
      /Describe a new game or tell the AI Director what to change/i,
    );
    fireEvent.change(input, {
      target: { value: "Generate a 3D spaceship, warp sound, music, voice, and nebula art" },
    });
    const sendBtn = screen.getByLabelText("Send to Director");
    fireEvent.click(sendBtn);

    await waitFor(() => {
      expect(screen.getByText(/Generated 3D model "Star Cruiser 3D"/i)).toBeTruthy();
      expect(screen.getByText(/Synthesized SFX "Warp Drive SFX"/i)).toBeTruthy();
      expect(screen.getByText(/Composed BGM track "Galaxy Synth BGM"/i)).toBeTruthy();
      expect(screen.getByText(/Generated TTS Voice "Captain Intro"/i)).toBeTruthy();
      expect(screen.getByText(/Generated background art "Nebula Background"/i)).toBeTruthy();
    });

    // Switch to AI Assets tab and verify all generated assets appear
    const assetsTab = screen.getByRole("button", { name: /AI Assets/i });
    fireEvent.click(assetsTab);

    expect(screen.getByText("Star Cruiser 3D")).toBeTruthy();
    expect(screen.getByText("Warp Drive SFX")).toBeTruthy();
    expect(screen.getByText("Galaxy Synth BGM")).toBeTruthy();
    expect(screen.getAllByText(/Captain Intro/i).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Nebula Background")).toBeTruthy();
  });

  it("unlocks achievements and opens the Publish modal", async () => {
    renderApp();

    // Switch to Achievements tab
    const achTab = screen.getByRole("button", { name: /Achievements/i });
    fireEvent.click(achTab);

    expect(screen.getByText("Spark of Warmth")).toBeTruthy();
    const testUnlockBtns = screen.getAllByRole("button", { name: /Test Unlock/i });
    fireEvent.click(testUnlockBtns[0]);

    await waitFor(() => {
      expect(screen.getByText("Unlocked")).toBeTruthy();
    });

    // Open Publish Modal
    const publishBtn = screen.getByRole("button", { name: /Publish Game/i });
    fireEvent.click(publishBtn);

    expect(screen.getByText("Publish to Custom Games")).toBeTruthy();
  });
});
