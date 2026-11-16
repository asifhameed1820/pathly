"use client";

import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Copy, Check } from "lucide-react";
import Prism from "prismjs";

// Import popular Prism language syntaxes
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-jsx";
import "prismjs/components/prism-tsx";
import "prismjs/components/prism-python";
import "prismjs/components/prism-css";
import "prismjs/components/prism-json";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-sql";
import "prismjs/components/prism-markdown";

interface ChatMarkdownRendererProps {
  content: string;
  isUser?: boolean;
  isStreaming?: boolean;
}

/**
 * CodeBlock sub-component with syntax highlighting, language badge,
 * and a 1-click clipboard copy button.
 */
function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback if clipboard API is blocked
    }
  };

  // Resolve language grammar in Prism
  const lang = language.toLowerCase();
  const grammar = Prism.languages[lang] || Prism.languages.javascript || Prism.languages.plain;
  let highlightedHtml = "";
  try {
    highlightedHtml = Prism.highlight(code, grammar, lang);
  } catch {
    highlightedHtml = code;
  }

  return (
    <div className="my-3 overflow-hidden rounded-xl border border-[#334155] bg-[#0F172A] shadow-md">
      {/* Code Header Bar */}
      <div className="flex items-center justify-between bg-[#1E293B] px-3.5 py-1.5 text-[11px] font-mono text-[#94A3B8] border-b border-[#334155]">
        <span className="font-semibold uppercase tracking-wider text-[#CBD5E1]">
          {language || "code"}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[10.5px] font-sans text-[#CBD5E1] hover:bg-[#334155] hover:text-white transition-all active:scale-95"
          title="Copy code to clipboard"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-[#10B981]" />
              <span className="text-[#10B981] font-semibold">Copied!</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      {/* Code Content with syntax highlighting */}
      <pre className="overflow-x-auto p-3.5 text-[12px] font-mono leading-relaxed text-[#F8FAFC]">
        <code
          dangerouslySetInnerHTML={{ __html: highlightedHtml }}
          className="block font-mono"
        />
      </pre>
    </div>
  );
}

/**
 * ChatGPT-Quality Markdown Renderer Component
 * Supports headers, bold, italics, nested lists, tables, inline code,
 * syntax-highlighted code blocks, blockquotes, and streaming cursor.
 */
export function ChatMarkdownRenderer({
  content,
  isUser = false,
  isStreaming = false,
}: ChatMarkdownRendererProps) {
  if (isUser) {
    return <div className="whitespace-pre-line text-white leading-relaxed">{content}</div>;
  }

  return (
    <div className="chat-markdown-body text-[12.5px] leading-relaxed text-[#1E293B]">
      <style jsx global>{`
        /* Syntax highlighting styles for dark code blocks */
        .chat-markdown-body .token.comment,
        .chat-markdown-body .token.prolog,
        .chat-markdown-body .token.doctype,
        .chat-markdown-body .token.cdata {
          color: #64748b;
          font-style: italic;
        }
        .chat-markdown-body .token.punctuation {
          color: #94a3b8;
        }
        .chat-markdown-body .token.property,
        .chat-markdown-body .token.tag,
        .chat-markdown-body .token.constant,
        .chat-markdown-body .token.symbol,
        .chat-markdown-body .token.deleted {
          color: #f43f5e;
        }
        .chat-markdown-body .token.boolean,
        .chat-markdown-body .token.number {
          color: #f59e0b;
        }
        .chat-markdown-body .token.selector,
        .chat-markdown-body .token.attr-name,
        .chat-markdown-body .token.string,
        .chat-markdown-body .token.char,
        .chat-markdown-body .token.builtin,
        .chat-markdown-body .token.inserted {
          color: #10b981;
        }
        .chat-markdown-body .token.operator,
        .chat-markdown-body .token.entity,
        .chat-markdown-body .token.url,
        .chat-markdown-body .language-css .token.string,
        .chat-markdown-body .style .token.string {
          color: #38bdf8;
        }
        .chat-markdown-body .token.atrule,
        .chat-markdown-body .token.attr-value,
        .chat-markdown-body .token.keyword {
          color: #a855f7;
          font-weight: 600;
        }
        .chat-markdown-body .token.function,
        .chat-markdown-body .token.class-name {
          color: #60a5fa;
        }
        .chat-markdown-body .token.regex,
        .chat-markdown-body .token.important,
        .chat-markdown-body .token.variable {
          color: #fb923c;
        }
      `}</style>

      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Headings
          h1: ({ children }) => (
            <h1 className="text-[15.5px] font-bold text-[#0F172A] mt-3.5 mb-2 leading-snug">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-[14px] font-bold text-[#0F172A] mt-3 mb-1.5 leading-snug">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-[13px] font-bold text-[#1E293B] mt-2.5 mb-1 leading-snug">
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className="text-[12px] font-semibold text-[#1E293B] mt-2 mb-0.5 leading-snug">
              {children}
            </h4>
          ),

          // Paragraphs
          p: ({ children }) => (
            <p className="mb-2.5 last:mb-0 leading-relaxed text-[#1E293B]">
              {children}
            </p>
          ),

          // Bold & Italic
          strong: ({ children }) => (
            <strong className="font-bold text-[#0F172A]">{children}</strong>
          ),
          em: ({ children }) => (
            <em className="italic text-[#334155]">{children}</em>
          ),

          // Lists
          ul: ({ children }) => (
            <ul className="list-disc pl-4 space-y-1.5 my-2 text-[12.5px] text-[#1E293B]">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal pl-4 space-y-1.5 my-2 text-[12.5px] text-[#1E293B]">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="leading-relaxed pl-0.5">{children}</li>
          ),

          // Blockquotes
          blockquote: ({ children }) => (
            <blockquote className="border-l-[3.5px] border-[#635BFF] bg-[#F8FAFC] pl-3 py-1.5 my-2.5 rounded-r-lg text-[12px] text-[#475569] italic shadow-xs">
              {children}
            </blockquote>
          ),

          // Tables (GFM)
          table: ({ children }) => (
            <div className="my-3 overflow-x-auto rounded-xl border border-[#E2E8F0] shadow-xs">
              <table className="w-full text-left text-[11.5px] border-collapse bg-white">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
              {children}
            </thead>
          ),
          tbody: ({ children }) => (
            <tbody className="divide-y divide-[#F1F5F9]">{children}</tbody>
          ),
          th: ({ children }) => (
            <th className="px-3 py-2 font-bold text-[#1E293B] text-[11px] uppercase tracking-wider">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-3 py-2 text-[#334155] text-[11.5px]">{children}</td>
          ),
          tr: ({ children }) => (
            <tr className="hover:bg-[#F8FAFC]/70 transition-colors">{children}</tr>
          ),

          // Dividers
          hr: () => <hr className="my-3 border-t border-[#E2E8F0]" />,

          // Links
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#635BFF] font-semibold underline hover:text-[#4F46E5] transition-colors"
            >
              {children}
            </a>
          ),

          // Code blocks & Inline code
          code: ({ className, children, ...props }) => {
            const match = /language-(\w+)/.exec(className || "");
            const codeString = String(children).replace(/\n$/, "");

            // If it has a language tag or contains newlines, render as CodeBlock
            if (match || codeString.includes("\n")) {
              return (
                <CodeBlock
                  language={match ? match[1] : "code"}
                  code={codeString}
                />
              );
            }

            // Inline code snippet
            return (
              <code
                className="px-1.5 py-0.5 rounded-md bg-[#F1F5F9] text-[#635BFF] font-mono text-[11px] font-semibold border border-[#E2E8F0]"
                {...props}
              >
                {children}
              </code>
            );
          },

          // Prevent double <pre> wrappers around CodeBlock
          pre: ({ children }) => <>{children}</>,
        }}
      >
        {content}
      </ReactMarkdown>

      {/* Streaming cursor */}
      {isStreaming && (
        <span
          className="inline-block w-1.5 h-3.5 ml-1 align-baseline bg-[#635BFF] animate-pulse rounded-xs"
          aria-hidden="true"
        />
      )}
    </div>
  );
}
