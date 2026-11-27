import { useRef, useState, type FormEvent } from 'react';

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
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const trimmed = value.trim();
  const canSubmit = !disabled && trimmed.length > 0;

  const submitPrompt = (): void => {
    if (!canSubmit) return;
    onSubmit(trimmed);
    setValue('');
    if (inputRef.current) inputRef.current.style.height = '';
  };

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    submitPrompt();
  };

  return (
    <form className="prompt-box" data-testid="prompt-box" onSubmit={submit}>
      <textarea
        ref={inputRef}
        id="run-prompt"
        className="prompt-input"
        data-testid="prompt-input"
        value={value}
        placeholder="Type a system to design…"
        disabled={disabled}
        onChange={(event) => {
          setValue(event.target.value);
          event.currentTarget.style.height = 'auto';
          event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 110)}px`;
        }}
        rows={1}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            submitPrompt();
          }
        }}
      />
      <div className="prompt-actions">
        <button
          className="generate-button"
          type="submit"
          data-testid="generate-button"
          aria-label="Draw architecture"
          title="Draw architecture"
          disabled={!canSubmit}
        >
          <span aria-hidden="true">↑</span>
        </button>
      </div>
    </form>
  );
}
