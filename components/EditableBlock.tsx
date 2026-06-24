
import React, { useState, useRef, useEffect } from 'react';

interface EditableBlockProps {
  as?: 'div' | 'span' | 'p' | 'h1' | 'h2' | 'h3';
  value: string;
  onUpdate: (newValue: string) => void;
  className?: string;
}

const EditableBlock: React.FC<EditableBlockProps> = ({ as: Component = 'span', value, onUpdate, className }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [currentValue, setCurrentValue] = useState(value);
  const elementRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setCurrentValue(value);
  }, [value]);

  const handleBlur = () => {
    setIsEditing(false);
    if (elementRef.current && elementRef.current.innerText !== value) {
      onUpdate(elementRef.current.innerText);
    }
  };
  
  const formatNewlines = (str: string) => {
    if (!str) return '';
    if (str.includes('<br') || str.includes('<p') || str.includes('<div')) {
      return str;
    }
    return str.replace(/\n/g, '<br />');
  };

  return React.createElement(Component, {
    ref: elementRef,
    className: `${className} focus:outline-none focus:bg-yellow-100/50 focus:ring-2 focus:ring-yellow-400 rounded-sm px-1 -mx-1`,
    contentEditable: true,
    suppressContentEditableWarning: true,
    onBlur: handleBlur,
    onFocus: () => setIsEditing(true),
    dangerouslySetInnerHTML: { __html: formatNewlines(value) }
  });
};

export default EditableBlock;
