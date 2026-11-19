import { useState, type FormEvent } from 'react';

/**
 * The prompt is local input only. Empty input is rejected here, before any
 * request is made. There is deliberately no cancel control.
 */
export function PromptBox({
  disabled,
  onSubmit,
}: {
  disabled: boolean;
  onSubmit: (prompt: string) => void;
}) {
  const [value, setValue] = useState('');
  const trimmed = value.trim();
  const canSubmit = !disabled && trimmed.length > 0;

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }
    onSubmit(trimmed);
  };

  return (
    <form className="prompt-box" data-testid="prompt-box" onSubmit={submit}>
      <label className="prompt-label" htmlFor="run-prompt">
        Prompt
      </label>
      <textarea
        id="run-prompt"
        className="prompt-input"
        data-testid="prompt-input"
        value={value}
        placeholder="Describe the architecture to generate…"
        disabled={disabled}
        onChange={(event) => setValue(event.target.value)}
      />
      <button
        className="generate-button"
        type="submit"
        data-testid="generate-button"
        disabled={!canSubmit}
      >
        Generate
      </button>
    </form>
  );
}
