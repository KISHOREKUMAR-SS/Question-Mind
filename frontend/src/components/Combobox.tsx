import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown } from 'lucide-react';

export function Combobox({
  options,
  value,
  onChange,
  placeholder,
}: {
  options: string[];
  value: string;
  onChange: (val: string) => void;
  placeholder: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredOptions = query === ''
    ? options
    : options.filter((option) =>
      option.toLowerCase().includes(query.toLowerCase())
    );

  return (
    <div className="relative" ref={wrapperRef}>
      <div className="relative">
        <input
          type="text"
          className="input pr-10 w-full"
          value={value || query} // Show value if set, else show query
          onChange={(event) => {
            setQuery(event.target.value);
            onChange(event.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
        />
        <button
          className="absolute inset-y-0 right-0 flex items-center pr-3 group pointer-events-none"
        >
          <ChevronDown className="h-5 w-5 text-gray-400 group-hover:text-pink-500 transition-colors" aria-hidden="true" />
        </button>
      </div>

      {isOpen && (
        <ul className="absolute z-[100] mt-1 max-h-48 w-full overflow-y-auto scrollbar-thin scrollbar-thumb-pink-200 dark:scrollbar-thumb-pink-800 rounded-md bg-white dark:bg-slate-900 py-1 text-base shadow-2xl ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm border border-pink-200 dark:border-pink-800">
          {filteredOptions.length === 0 && query !== '' ? (
            <div className="relative cursor-default select-none py-2 px-4 text-gray-700 dark:text-gray-400">
              Create "{query}"
            </div>
          ) : (
            filteredOptions.map((option, idx) => (
              <li
                key={idx}
                className="relative cursor-default select-none py-2 pl-3 pr-9 text-gray-900 dark:text-gray-100 hover:bg-pink-50 dark:hover:bg-pink-900/20"
                onClick={() => {
                  onChange(option);
                  setQuery('');
                  setIsOpen(false);
                }}
              >
                <span className="block truncate">{option}</span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
