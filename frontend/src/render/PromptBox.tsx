import { useState, type FormEvent } from 'react';

/**
 * A small canvas composer for turning a plain-language idea into a first draft.
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
      <textarea
        id="run-prompt"
        className="prompt-input"
        data-testid="prompt-input"
        value={value}
        placeholder="Describe a system to draw… e.g. Design Netflix"
        disabled={disabled}
        onChange={(event) => setValue(event.target.value)}
        rows={1}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            if (canSubmit) onSubmit(trimmed);
          }
        }}
      />
      <button
        className="generate-button"
        type="submit"
        data-testid="generate-button"
        disabled={!canSubmit}
      >
        Draw
      </button>
    </form>
  );
}
