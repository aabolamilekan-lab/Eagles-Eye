"use client";

import {
  useEffect,
  useId,
  useReducer,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  Undo2,
  Unlink,
} from "lucide-react";
import { ToolbarButton } from "@/components/admin/AdminForm";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { isAllowedLinkHref, normalizeLinkHref } from "@/lib/rich-text/link";

/**
 * Long-form chapter editor, built on Tiptap.
 *
 * Scope is deliberate: the formatting an author of prose needs and nothing
 * more — headings, paragraphs, bold, italic, links, bulleted and numbered
 * lists, blockquotes and horizontal rules, plus undo/redo. Strikethrough,
 * inline code and code blocks are switched off because they pull the editor
 * away from storytelling. Text alignment is deliberately not offered: ragged
 * right edges are the accessible default for long-form reading and justified
 * text creates uneven spacing. The `prose` stylesheet owns all appearance.
 *
 * This component is a UX surface, not a trust boundary. It refuses to create an
 * unsafe link and normalises what the operator types, but the server sanitizer
 * in `src/lib/sanitize/rich-text.ts` is the sole authority on stored HTML and
 * runs again on every write (AGENTS.md section 10).
 */
export interface RichTextEditorProps {
  name: string;
  value: string;
  onChange: (html: string) => void;
  error?: string | undefined;
  /** Visible field label and the editable region's accessible name. */
  label?: string;
  /** Shown inside the empty editor. */
  placeholder?: string;
}

function buildExtensions() {
  return [
    StarterKit.configure({
      // Headings only where a running chapter header belongs. The page keeps
      // the single `h1`, so the editor offers `h2` and `h3`.
      heading: { levels: [2, 3] },
      code: false,
      codeBlock: false,
      strike: false,
      underline: false,
      link: {
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        defaultProtocol: "https",
        protocols: ["http", "https", "mailto"],
        isAllowedUri: (url: string) => isAllowedLinkHref(url),
        shouldAutoLink: (url: string) => isAllowedLinkHref(url),
        HTMLAttributes: { rel: "noopener noreferrer" },
      },
    }),
  ];
}

export function RichTextEditor({
  name,
  value,
  onChange,
  error,
  label = "Description",
  placeholder = "Start writing…",
}: RichTextEditorProps) {
  const labelId = useId();
  const linkInputId = useId();

  // Extensions are built once. A stable instance avoids reconfiguring the
  // schema while the operator is typing.
  const [extensions] = useState(buildExtensions);

  // Tiptap v3 no longer re-renders on every transaction, so the toolbar's
  // active states, the placeholder and the word count are refreshed explicitly.
  const [, refresh] = useReducer((count: number) => count + 1, 0);

  // The latest `onChange` without recreating the editor when the parent
  // re-renders with a new function identity.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  const editor = useEditor({
    extensions,
    content: value,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "prose min-h-64 px-4 py-3 focus:outline-none sm:px-5 sm:py-4",
        role: "textbox",
        "aria-multiline": "true",
        "aria-labelledby": labelId,
      },
    },
    onUpdate: ({ editor: instance }) => onChangeRef.current(instance.getHTML()),
    onTransaction: () => refresh(),
  });

  const [linkOpen, setLinkOpen] = useState(false);
  const linkTriggerRef = useRef<HTMLElement | null>(null);

  const openLink = () => {
    linkTriggerRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setLinkOpen(true);
  };

  const closeLink = () => {
    setLinkOpen(false);
    linkTriggerRef.current?.focus();
  };

  const words = editor ? countWords(editor.getText()) : 0;

  return (
    <div className="flex w-full flex-col gap-1.5">
      <p id={labelId} className="font-ui text-body-sm font-medium text-ink">
        {label}
      </p>

      <div
        className={cn(
          "overflow-hidden rounded-md border bg-surface",
          error ? "border-error" : "border-border-strong",
          "focus-within:ring-2 focus-within:ring-primary/40",
        )}
      >
        {editor ? (
          <RichTextToolbar
            editor={editor}
            linkOpen={linkOpen}
            onToggleLink={() => (linkOpen ? closeLink() : openLink())}
          />
        ) : null}

        {editor && linkOpen ? (
          <LinkPopover
            editor={editor}
            inputId={linkInputId}
            onClose={closeLink}
          />
        ) : null}

        <div className="relative">
          <EditorContent editor={editor} />
          {editor && editor.isEmpty ? (
            <p
              aria-hidden="true"
              className="pointer-events-none absolute left-4 top-3 font-serif text-[length:var(--text-body-read)] leading-[var(--leading-prose)] text-ink-subtle/70 sm:left-5 sm:top-4"
            >
              {placeholder}
            </p>
          ) : null}
        </div>

        <div className="flex items-center justify-end border-t border-border bg-surface-sunken px-3 py-1.5 font-ui text-body-xs tabular-nums text-ink-subtle">
          <span>
            {words} {words === 1 ? "word" : "words"}
          </span>
        </div>
      </div>

      <input type="hidden" name={name} value={value} />

      {error ? (
        <p role="alert" className="font-ui text-body-xs font-medium text-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed === "" ? 0 : trimmed.split(/\s+/).length;
}

interface ToolbarItem {
  key: string;
  label: string;
  active?: boolean;
  keyshortcuts?: string;
  icon: ReactNode;
  run: () => void;
}

function RichTextToolbar({
  editor,
  linkOpen,
  onToggleLink,
}: {
  editor: Editor;
  linkOpen: boolean;
  onToggleLink: () => void;
}) {
  const items: Array<ToolbarItem | "divider"> = [
    {
      key: "bold",
      label: "Bold",
      keyshortcuts: "Control+B Meta+B",
      active: editor.isActive("bold"),
      icon: <Bold className="size-4" />,
      run: () => editor.chain().focus().toggleBold().run(),
    },
    {
      key: "italic",
      label: "Italic",
      keyshortcuts: "Control+I Meta+I",
      active: editor.isActive("italic"),
      icon: <Italic className="size-4" />,
      run: () => editor.chain().focus().toggleItalic().run(),
    },
    "divider",
    {
      key: "h2",
      label: "Section heading",
      keyshortcuts: "Control+Alt+2",
      active: editor.isActive("heading", { level: 2 }),
      icon: <Heading2 className="size-4" />,
      run: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      key: "h3",
      label: "Subheading",
      keyshortcuts: "Control+Alt+3",
      active: editor.isActive("heading", { level: 3 }),
      icon: <Heading3 className="size-4" />,
      run: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
    },
    "divider",
    {
      key: "bulletList",
      label: "Bulleted list",
      keyshortcuts: "Control+Shift+8",
      active: editor.isActive("bulletList"),
      icon: <List className="size-4" />,
      run: () => editor.chain().focus().toggleBulletList().run(),
    },
    {
      key: "orderedList",
      label: "Numbered list",
      keyshortcuts: "Control+Shift+7",
      active: editor.isActive("orderedList"),
      icon: <ListOrdered className="size-4" />,
      run: () => editor.chain().focus().toggleOrderedList().run(),
    },
    {
      key: "blockquote",
      label: "Quote",
      keyshortcuts: "Control+Shift+B",
      active: editor.isActive("blockquote"),
      icon: <Quote className="size-4" />,
      run: () => editor.chain().focus().toggleBlockquote().run(),
    },
    {
      key: "horizontalRule",
      label: "Divider",
      icon: <Minus className="size-4" />,
      run: () => editor.chain().focus().setHorizontalRule().run(),
    },
    "divider",
    {
      key: "link",
      label: editor.isActive("link") ? "Edit link" : "Insert link",
      active: editor.isActive("link") || linkOpen,
      icon: <Link2 className="size-4" />,
      run: onToggleLink,
    },
    "divider",
    {
      key: "undo",
      label: "Undo",
      keyshortcuts: "Control+Z Meta+Z",
      icon: <Undo2 className="size-4" />,
      run: () => editor.chain().focus().undo().run(),
    },
    {
      key: "redo",
      label: "Redo",
      keyshortcuts: "Control+Shift+Z Meta+Shift+Z",
      icon: <Redo2 className="size-4" />,
      run: () => editor.chain().focus().redo().run(),
    },
  ];

  // The toolbar is a single tab stop: one button holds `tabIndex=0`, the rest
  // are reached with the arrow keys, per the ARIA toolbar pattern.
  const [focusKey, setFocusKey] = useState("bold");

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement) || !target.dataset.tool) {
      return;
    }

    const buttons = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>(
        "button[data-tool]",
      ),
    );
    const current = buttons.indexOf(target);
    if (current < 0) {
      return;
    }

    let next = -1;
    if (event.key === "ArrowRight") {
      next = (current + 1) % buttons.length;
    } else if (event.key === "ArrowLeft") {
      next = (current - 1 + buttons.length) % buttons.length;
    } else if (event.key === "Home") {
      next = 0;
    } else if (event.key === "End") {
      next = buttons.length - 1;
    }
    if (next < 0) {
      return;
    }

    event.preventDefault();
    const button = buttons[next];
    if (button) {
      button.focus();
      if (button.dataset.tool) {
        setFocusKey(button.dataset.tool);
      }
    }
  };

  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      aria-orientation="horizontal"
      onKeyDown={onKeyDown}
      className="flex flex-wrap items-center gap-0.5 border-b border-border bg-surface-sunken px-2 py-1.5"
    >
      {items.map((item, index) =>
        item === "divider" ? (
          <Divider key={`divider-${index}`} />
        ) : (
          <ToolbarButton
            key={item.key}
            data-tool={item.key}
            label={item.label}
            active={item.active}
            aria-keyshortcuts={item.keyshortcuts}
            tabIndex={focusKey === item.key ? 0 : -1}
            onFocus={() => setFocusKey(item.key)}
            onClick={item.run}
          >
            {item.icon}
          </ToolbarButton>
        ),
      )}
    </div>
  );
}

function Divider() {
  return <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-border" />;
}

function LinkPopover({
  editor,
  inputId,
  onClose,
}: {
  editor: Editor;
  inputId: string;
  onClose: () => void;
}) {
  const initialHref = (editor.getAttributes("link") as { href?: unknown }).href;
  const [value, setValue] = useState(
    typeof initialHref === "string" ? initialHref : "",
  );
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isLinked = editor.isActive("link");

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const apply = () => {
    const href = normalizeLinkHref(value);
    if (!href) {
      setError(
        "Enter a web address (https://…), an email address, or a page path.",
      );
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    onClose();
  };

  const remove = () => {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-label={isLinked ? "Edit link" : "Insert link"}
      className="flex flex-col gap-2 border-b border-border bg-surface px-3 py-3 sm:flex-row sm:items-end"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <label
          htmlFor={inputId}
          className="font-ui text-body-xs font-medium text-ink"
        >
          Link address
        </label>
        <input
          id={inputId}
          ref={inputRef}
          type="text"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            if (error) {
              setError(null);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              apply();
            } else if (event.key === "Escape") {
              event.preventDefault();
              onClose();
            }
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${inputId}-error` : undefined}
          className={cn(
            "w-full rounded-sm border bg-paper px-3 py-2 font-ui text-body-sm text-ink",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
            error ? "border-error" : "border-border-strong",
          )}
        />
        {error ? (
          <p
            id={`${inputId}-error`}
            role="alert"
            className="font-ui text-body-xs text-error"
          >
            {error}
          </p>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <Button type="button" size="sm" variant="primary" onClick={apply}>
          Apply
        </Button>
        {isLinked ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            leadingIcon={<Unlink className="size-4" />}
            onClick={remove}
          >
            Remove
          </Button>
        ) : null}
        <Button type="button" size="sm" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
