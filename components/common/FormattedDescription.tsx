import React from 'react';

interface FormattedDescriptionProps {
  content?: string | null;
  className?: string;
  defaultText?: string;
}

export const FormattedDescription: React.FC<FormattedDescriptionProps> = ({
  content,
  className = '',
  defaultText = ''
}) => {
  if (!content) {
    if (!defaultText) return null;
    return <span className={className}>{defaultText}</span>;
  }

  // Detect if content has HTML tags
  const hasHtml = /<[a-z][\s\S]*>/i.test(content);

  if (hasHtml) {
    return (
      <div
        className={`leading-relaxed [&_ul]:list-disc [&_ul]:pl-4 [&_ul]:my-1 [&_ol]:list-decimal [&_ol]:pl-4 [&_ol]:my-1 [&_p]:my-0.5 [&_b]:font-bold [&_strong]:font-bold [&_u]:underline ${className}`}
        dangerouslySetInnerHTML={{ __html: content }}
      />
    );
  }

  // Fallback for plain text: preserve line breaks
  return (
    <div className={`whitespace-pre-wrap leading-relaxed ${className}`}>
      {content}
    </div>
  );
};

export default FormattedDescription;
