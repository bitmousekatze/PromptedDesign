import React, { useState, useEffect, useRef, useMemo } from 'react';
import { AI_TOOL_NAMES, normalizeToolLabel, normalizeToolList, getModelsForTool } from '../lib/appShared.js';
import styles from './BuiltWithSelector.module.css';

const BuiltWithSelector = ({ selectedTools, selectedModels = {}, onChange, onModelsChange, label = 'Built With' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [toolSearch, setToolSearch] = useState('');
  const dropdownRef = useRef(null);
  const normalizedSelectedTools = useMemo(() => normalizeToolList(selectedTools), [selectedTools]);

  const selectedToolsLower = useMemo(
    () => new Set(normalizedSelectedTools.map(tool => tool.toLowerCase())),
    [normalizedSelectedTools]
  );

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
        setToolSearch('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const availableTools = normalizeToolList(AI_TOOL_NAMES);
  const filteredTools = toolSearch.trim()
    ? availableTools.filter(t => t.toLowerCase().includes(toolSearch.toLowerCase().trim()))
    : availableTools;

  const toggleTool = (tool) => {
    const normalizedTool = normalizeToolLabel(tool);
    const hasTool = selectedToolsLower.has(normalizedTool.toLowerCase());

    if (hasTool) {
      const next = normalizedSelectedTools.filter(t => t.toLowerCase() !== normalizedTool.toLowerCase());
      onChange(next);
      if (onModelsChange) {
        const nextModels = { ...selectedModels };
        delete nextModels[normalizedTool];
        onModelsChange(nextModels);
      }
    } else {
      onChange([...normalizedSelectedTools, normalizedTool]);
    }
  };

  const removeTool = (tool, e) => {
    e.stopPropagation();
    e.preventDefault();
    const normalizedTool = normalizeToolLabel(tool);
    const next = normalizedSelectedTools.filter(t => t.toLowerCase() !== normalizedTool.toLowerCase());
    onChange(next);
    if (onModelsChange) {
      const nextModels = { ...selectedModels };
      delete nextModels[normalizedTool];
      onModelsChange(nextModels);
    }
  };

  const clearAllTools = (e) => {
    e.stopPropagation();
    onChange([]);
    if (onModelsChange) onModelsChange({});
  };

  const handleModelChange = (tool, model) => {
    if (!onModelsChange) return;
    const nextModels = { ...selectedModels };
    if (model) nextModels[tool] = model;
    else delete nextModels[tool];
    onModelsChange(nextModels);
  };

  return (
    <div className="form-group" ref={dropdownRef} style={{ position: 'relative' }}>
      <label className="form-label">{label}</label>
      <div
        className={styles.selector}
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className={styles.selectedTools}>
          {normalizedSelectedTools.length > 0 ? normalizedSelectedTools.map(tool => (
            <span key={tool} className={styles.tag}>
              {tool}{selectedModels[tool] ? ` (${selectedModels[tool]})` : ''}
              <button type="button" className={styles.tagRemove} onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); }} onClick={(e) => removeTool(tool, e)}>✕</button>
            </span>
          )) : (
            <span style={{ color: 'var(--text-muted)' }}>Select tools...</span>
          )}
        </div>
        <span className={styles.chevron}>{isOpen ? '▲' : '▼'}</span>
      </div>
      {isOpen && (
        <div className={styles.dropdown}>
          <input
            type="text"
            className={styles.search}
            placeholder="Search tools..."
            value={toolSearch}
            onChange={(e) => setToolSearch(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            autoFocus
          />
          <div className={styles.options}>
            {filteredTools.length > 0 ? filteredTools.map(tool => (
              <button
                key={tool}
                type="button"
                className={`${styles.option} ${selectedToolsLower.has(tool.toLowerCase()) ? styles.selected : ''}`}
                onClick={(e) => { e.stopPropagation(); toggleTool(tool); }}
              >
                <span className={styles.checkbox}>{selectedToolsLower.has(tool.toLowerCase()) ? '✓' : ''}</span>
                {tool}
              </button>
            )) : (
              <div style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>No tools found</div>
            )}
          </div>
          {normalizedSelectedTools.length > 0 && (
            <div style={{ borderTop: '1px solid var(--border-color)', padding: '0.75rem 1rem', display: 'grid', gap: '0.5rem' }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Optional: select model per tool</span>
                <button type="button" className={styles.clearBtn} onClick={clearAllTools}>Clear all</button>
              </div>
              {normalizedSelectedTools.map(tool => {
                const models = getModelsForTool(tool);
                if (models.length === 0) return null;
                return (
                  <div key={`${tool}-model`} style={{ display: 'grid', gap: '0.35rem' }} onClick={(e) => e.stopPropagation()}>
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-primary)' }}>{tool}</span>
                    <select
                      className="form-input"
                      value={selectedModels[tool] || ''}
                      onChange={(e) => handleModelChange(tool, e.target.value)}
                      style={{ minHeight: '2.1rem', fontSize: '0.82rem' }}
                    >
                      <option value="">Any model</option>
                      {models.map(model => (
                        <option key={`${tool}-${model}`} value={model}>{model}</option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default BuiltWithSelector;
