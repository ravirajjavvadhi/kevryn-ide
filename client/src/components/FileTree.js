import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FaFolder, FaFolderOpen, FaJs, FaPython, FaCode, FaFile, FaPlus } from 'react-icons/fa';
import { SiCplusplus } from 'react-icons/si';

const getFileIcon = (name) => {
  if (name.endsWith('.js') || name.endsWith('.jsx')) return <FaJs color="#f7df1e" />;
  if (name.endsWith('.ts') || name.endsWith('.tsx')) return <FaJs color="#3178c6" />;
  if (name.endsWith('.py')) return <FaPython color="#3776ab" />;
  if (name.endsWith('.cpp') || name.endsWith('.c') || name.endsWith('.h')) return <SiCplusplus color="#00599c" />;
  if (name.endsWith('.html')) return <FaCode color="#e34c26" />;
  if (name.endsWith('.css')) return <FaCode color="#264de4" />;
  if (name.endsWith('.json')) return <FaFile color="#fbc02d" />;
  if (name.endsWith('.md')) return <FaFile color="#42a5f5" />;
  return <FaFile color="#9e9e9e" />;
};

// ── Context Menu ────────────────────────────────────────────────────────────
const ContextMenu = ({ x, y, node, onClose, onCreate, onCreateFolder, onRename, onDelete, onDownload, onCopyPath }) => {
  const menuRef = useRef(null);

  // Adjust position so menu doesn't overflow viewport
  const [pos, setPos] = useState({ x, y });
  useEffect(() => {
    if (menuRef.current) {
      const { innerWidth, innerHeight } = window;
      const rect = menuRef.current.getBoundingClientRect();
      setPos({
        x: x + rect.width > innerWidth ? x - rect.width : x,
        y: y + rect.height > innerHeight ? y - rect.height : y,
      });
    }
  }, [x, y]);

  const isFolder = node.type === 'folder';
  const isRoot = node._id === 'root';

  const Item = ({ icon, label, shortcut, onClick, danger }) => (
    <div
      className="vsc-ctx-item"
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '5px 12px', cursor: 'pointer', fontSize: '13px',
        color: danger ? '#f47174' : '#cccccc',
        gap: '8px', whiteSpace: 'nowrap',
        borderRadius: '3px', margin: '1px 4px',
      }}
      onMouseEnter={e => e.currentTarget.style.background = '#094771'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      onClick={(e) => { e.stopPropagation(); onClose(); onClick(); }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '12px', opacity: 0.8 }}>{icon}</span>
        {label}
      </span>
      {shortcut && <span style={{ fontSize: '11px', opacity: 0.5, marginLeft: '20px' }}>{shortcut}</span>}
    </div>
  );

  const Separator = () => (
    <div style={{ height: '1px', background: '#333', margin: '3px 0' }} />
  );

  return (
    <div
      ref={menuRef}
      style={{
        position: 'fixed', top: pos.y, left: pos.x,
        background: '#1f1f1f', border: '1px solid #454545',
        borderRadius: '5px', padding: '4px 0',
        zIndex: 9999, minWidth: '185px',
        boxShadow: '0 6px 24px rgba(0,0,0,0.6)',
        fontFamily: 'Segoe UI, sans-serif',
      }}
      onClick={e => e.stopPropagation()}
    >
      {/* New File / New Folder — always show */}
      <Item icon="📄" label="New File" shortcut="Ctrl+N" onClick={() => onCreate(node._id)} />
      <Item icon="📁" label="New Folder" shortcut="Ctrl+Shift+N" onClick={() => onCreateFolder(node._id)} />

      {!isRoot && (
        <>
          <Separator />
          <Item icon="✏️" label="Rename" shortcut="F2" onClick={() => onRename(node)} />
          {!isFolder && <Item icon="⬇️" label="Download" onClick={() => onDownload(node)} />}
          <Item icon="📋" label="Copy Path" onClick={() => onCopyPath(node)} />
          <Separator />
          <Item icon="🗑️" label="Delete" shortcut="Del" onClick={() => onDelete(node._id)} danger />
        </>
      )}
    </div>
  );
};

// ── FileTree Node ────────────────────────────────────────────────────────────
const FileTree = ({
  data,
  activeId,
  onFileClick,
  onCreate,
  onCreateFolder,
  onDelete,
  onRename,
  onDownload,
  onCopyPath,
  level = 0,
}) => {
  const [isOpen, setIsOpen] = useState(level === 0); // root open by default
  const [contextMenu, setContextMenu] = useState(null); // { x, y }
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(data.name);
  const renameInputRef = useRef(null);
  const nodeRef = useRef(null);

  const isFolder = data.type === 'folder';
  const isActive = activeId === data._id;

  // ── Keyboard navigation on the node ───────────────────────────────────────
  const handleKeyDown = useCallback((e) => {
    if (!isActive) return;

    if (e.key === 'F2') {
      e.preventDefault();
      if (data._id !== 'root') { setRenameValue(data.name); setIsRenaming(true); }
    }
    if (e.key === 'Delete' && data._id !== 'root') {
      e.preventDefault();
      onDelete(data._id);
    }
    if (e.key === 'Enter' && isFolder) {
      setIsOpen(o => !o);
    }
    if (e.key === 'ArrowRight' && isFolder) setIsOpen(true);
    if (e.key === 'ArrowLeft' && isFolder) setIsOpen(false);
  }, [isActive, data, isFolder, onDelete]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // ── Rename inline ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (isRenaming && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [isRenaming]);

  const commitRename = () => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== data.name) onRename({ ...data, _newName: trimmed });
    setIsRenaming(false);
  };

  const handleRenameKey = (e) => {
    if (e.key === 'Enter') commitRename();
    if (e.key === 'Escape') setIsRenaming(false);
  };

  // ── Context Menu ───────────────────────────────────────────────────────────
  const handleContextMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [contextMenu]);

  // ── Hover state ────────────────────────────────────────────────────────────
  const [hovered, setHovered] = useState(false);

  const nodeStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '3px 6px 3px 0',
    cursor: 'pointer',
    borderRadius: '4px',
    userSelect: 'none',
    background: isActive ? 'rgba(9,71,113,0.6)' : hovered ? 'rgba(255,255,255,0.06)' : 'transparent',
    color: isActive ? '#fff' : '#ccc',
    fontSize: '13px',
    fontFamily: 'Segoe UI, sans-serif',
    transition: 'background 0.12s',
  };

  return (
    <div style={{ marginLeft: level === 0 ? '0' : '12px', position: 'relative' }}>
      {/* ── Node Row ── */}
      <div
        ref={nodeRef}
        className={`file-node ${isActive ? 'active' : ''}`}
        style={nodeStyle}
        tabIndex={0}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={(e) => {
          e.stopPropagation();
          if (isFolder) setIsOpen(o => !o);
          else onFileClick(data);
        }}
        onContextMenu={handleContextMenu}
      >
        {/* Folder arrow */}
        {isFolder && (
          <span style={{ fontSize: '9px', opacity: 0.6, minWidth: '10px' }}>
            {isOpen ? '▾' : '▸'}
          </span>
        )}

        {/* Icon */}
        <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          {isFolder ? (isOpen ? <FaFolderOpen color="#dcb67a" /> : <FaFolder color="#dcb67a" />) : getFileIcon(data.name)}
        </span>

        {/* Name or inline rename */}
        {isRenaming ? (
          <input
            ref={renameInputRef}
            value={renameValue}
            onChange={e => setRenameValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={handleRenameKey}
            style={{
              background: '#1a1a2e', color: '#fff',
              border: '1px solid #007acc', borderRadius: '3px',
              padding: '1px 4px', fontSize: '13px',
              outline: 'none', width: '100%',
            }}
            onClick={e => e.stopPropagation()}
          />
        ) : (
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {data.name}
          </span>
        )}

        {/* Action icons on hover — only for folders */}
        {isFolder && (hovered || isActive) && !isRenaming && (
          <span style={{ display: 'flex', gap: '4px', marginLeft: 'auto', opacity: 0.7 }}>
            <span
              title="New File (Ctrl+N)"
              style={{ padding: '2px 5px', borderRadius: '3px', fontSize: '10px', display: 'flex', alignItems: 'center', gap: '2px' }}
              onMouseEnter={e => e.currentTarget.style.opacity = '1'}
              onMouseLeave={e => e.currentTarget.style.opacity = '0.7'}
              onClick={e => { e.stopPropagation(); onCreate(data._id); }}
            >
              <FaPlus style={{ fontSize: '8px' }} /><span style={{ fontSize: '9px' }}>F</span>
            </span>
            <span
              title="New Folder (Ctrl+Shift+N)"
              style={{ padding: '2px 5px', borderRadius: '3px', fontSize: '10px', display: 'flex', alignItems: 'center', gap: '2px' }}
              onMouseEnter={e => e.currentTarget.style.opacity = '1'}
              onMouseLeave={e => e.currentTarget.style.opacity = '0.7'}
              onClick={e => { e.stopPropagation(); onCreateFolder(data._id); }}
            >
              <FaPlus style={{ fontSize: '8px' }} /><FaFolder style={{ fontSize: '9px' }} />
            </span>
          </span>
        )}
      </div>

      {/* ── Children ── */}
      {isOpen && isFolder && data.children && data.children.map(child => (
        <FileTree
          key={child._id}
          data={child}
          activeId={activeId}
          onFileClick={onFileClick}
          onCreate={onCreate}
          onCreateFolder={onCreateFolder}
          onDelete={onDelete}
          onRename={onRename}
          onDownload={onDownload}
          onCopyPath={onCopyPath}
          level={level + 1}
        />
      ))}

      {/* ── Context Menu ── */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          node={data}
          onClose={() => setContextMenu(null)}
          onCreate={onCreate}
          onCreateFolder={onCreateFolder}
          onRename={onRename}
          onDelete={onDelete}
          onDownload={onDownload}
          onCopyPath={onCopyPath}
        />
      )}
    </div>
  );
};

export default FileTree;