/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ProjectTextField } from "./ProjectTextField";
afterEach(cleanup);
describe("Project text drafts", () => {
  it("keeps rapid typing local and saves the complete draft on blur", async () => {
    const save = vi.fn().mockResolvedValue({});
    render(<ProjectTextField value="" onSave={save} />);
    const field = screen.getByRole("textbox");
    for (const value of ["P", "Pr", "Project reviewer"]) fireEvent.change(field, { target: { value } });
    expect(save).not.toHaveBeenCalled();
    expect((field as HTMLInputElement).value).toBe("Project reviewer");
    fireEvent.blur(field);
    await waitFor(() => expect(save).toHaveBeenCalledWith("Project reviewer"));
  });
  it("preserves failed drafts across server updates and permits retry", async () => {
    const save = vi.fn().mockResolvedValue(null);
    const view = render(<ProjectTextField value="Original" onSave={save} />);
    const field = screen.getByRole("textbox");
    fireEvent.change(field, { target: { value: "Unsaved" } });
    fireEvent.blur(field);
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    view.rerender(<ProjectTextField value="Remote change" onSave={save} />);
    expect((field as HTMLInputElement).value).toBe("Unsaved");
    save.mockResolvedValue({});
    fireEvent.blur(field);
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
  });
});
