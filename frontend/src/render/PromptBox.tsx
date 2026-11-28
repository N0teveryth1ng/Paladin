'use client';

import { ArrowUp } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';

import { Button } from '../../components/ui/button';
import { Textarea } from '../../components/ui/input';

/**
 * Premium composer for turning a plain-language idea into a first draft.
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
    <form
      className="mt-auto rounded-xl border border-white/10 bg-zinc-900/50 p-2 shadow-[0_10px_40px_-20px_rgba(0,0,0,0.9)] backdrop-blur-xl transition-colors focus-within:border-indigo-400/40"
      data-testid="prompt-box"
      onSubmit={submit}
    >
      <Textarea
        ref={inputRef}
        id="run-prompt"
        className="min-h-9 max-h-28 border-0 bg-transparent px-2 py-1 text-sm shadow-none focus-visible:border-0 focus-visible:ring-0"
        data-testid="prompt-input"
        value={value}
        placeholder="Describe a system to design…"
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
      <div className="flex justify-end pt-1">
        <Button
          className="h-9 w-9 rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-600 text-white shadow-[0_0_22px_-4px_rgba(139,92,246,0.9)] hover:brightness-110"
          type="submit"
          size="icon"
          variant="default"
          data-testid="generate-button"
          aria-label="Draw architecture"
          title="Draw architecture"
          disabled={!canSubmit}
        >
          <ArrowUp className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </form>
  );
}
