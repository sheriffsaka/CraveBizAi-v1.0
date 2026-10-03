import React, { useRef, useEffect, useState } from 'react';
import { Bold, Italic, Underline, List, ListOrdered, RemoveFormatting, Code, Eye } from 'lucide-react';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minHeight?: string;
  className?: string;
}

export const RichTextEditor: React.FC<RichTextEditorProps> = ({
  value,
  onChange,
  placeholder = 'Enter detailed service description, scope, deliverables...',
  minHeight = '130px',
  className = ''
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const [isSourceMode, setIsSourceMode] = useState(false);
  const lastHtmlRef = useRef(value);

  // Sync editor content with external value changes (e.g. initial load or AI generation)
  useEffect(() => {
    if (editorRef.current && value !== lastHtmlRef.current) {
      editorRef.current.innerHTML = value || '';
      lastHtmlRef.current = value || '';
    }
  }, [value]);

  const handleInput = () => {
    if (editorRef.current) {
      const html = editorRef.current.innerHTML;
      // If user clears everything, innerHTML may be '<br>' or empty
      const cleanHtml = html === '<br>' || html === '<div><br></div>' ? '' : html;
      lastHtmlRef.current = cleanHtml;
      onChange(cleanHtml);
    }
  };

  const executeCommand = (command: string, arg: string | undefined = undefined) => {
    if (isSourceMode) return;
    editorRef.current?.focus();
    document.execCommand(command, false, arg);
    handleInput();
  };

  return (
    <div className={`border border-gray-300 rounded-lg overflow-hidden bg-white shadow-2xs focus-within:ring-2 focus-within:ring-primary-500 focus-within:border-primary-500 transition-all ${className}`}>
      {/* Formatting Toolbar */}
      <div className="bg-gray-50 border-b border-gray-200 px-3 py-1.5 flex flex-wrap items-center justify-between gap-1 select-none">
        <div className="flex items-center space-x-1">
          <button
            type="button"
            onClick={() => executeCommand('bold')}
            title="Bold (Ctrl+B)"
            className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-200 rounded transition-colors"
          >
            <Bold className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => executeCommand('italic')}
            title="Italic (Ctrl+I)"
            className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-200 rounded transition-colors"
          >
            <Italic className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => executeCommand('underline')}
            title="Underline (Ctrl+U)"
            className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-200 rounded transition-colors"
          >
            <Underline className="w-3.5 h-3.5" />
          </button>

          <span className="w-px h-4 bg-gray-300 mx-1" />

          <button
            type="button"
            onClick={() => executeCommand('insertUnorderedList')}
            title="Bullet List"
            className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-200 rounded transition-colors"
          >
            <List className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => executeCommand('insertOrderedList')}
            title="Numbered List"
            className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-200 rounded transition-colors"
          >
            <ListOrdered className="w-3.5 h-3.5" />
          </button>

          <span className="w-px h-4 bg-gray-300 mx-1" />

          <button
            type="button"
            onClick={() => executeCommand('removeFormat')}
            title="Clear Formatting"
            className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
          >
            <RemoveFormatting className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex items-center space-x-1">
          <button
            type="button"
            onClick={() => setIsSourceMode(!isSourceMode)}
            title={isSourceMode ? "Visual Editor" : "HTML Source View"}
            className={`px-2 py-1 text-[10px] font-bold rounded flex items-center space-x-1 transition-colors ${
              isSourceMode
                ? 'bg-purple-100 text-purple-700'
                : 'text-gray-500 hover:bg-gray-200 hover:text-gray-700'
            }`}
          >
            {isSourceMode ? (
              <>
                <Eye className="w-3 h-3" />
                <span>Visual</span>
              </>
            ) : (
              <>
                <Code className="w-3 h-3" />
                <span>HTML</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Editor Body */}
      {isSourceMode ? (
        <textarea
          value={value}
          onChange={(e) => {
            lastHtmlRef.current = e.target.value;
            onChange(e.target.value);
          }}
          placeholder="Edit raw HTML..."
          style={{ minHeight }}
          className="w-full p-3 font-mono text-xs bg-gray-900 text-gray-100 border-none outline-none resize-y"
        />
      ) : (
        <div
          ref={editorRef}
          contentEditable
          onInput={handleInput}
          onBlur={handleInput}
          style={{ minHeight }}
          data-placeholder={placeholder}
          className="p-3 text-sm text-gray-800 outline-none overflow-y-auto leading-relaxed
            [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-1
            [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-1
            [&_p]:my-1 [&_b]:font-bold [&_strong]:font-bold [&_u]:underline
            empty:before:content-[attr(data-placeholder)] empty:before:text-gray-400 empty:before:pointer-events-none"
        />
      )}
    </div>
  );
};

export default RichTextEditor;
