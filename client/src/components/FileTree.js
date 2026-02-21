import React, { useState, useEffect } from 'react';
import { FaFolder, FaFolderOpen, FaJs, FaPython, FaCode, FaFile } from 'react-icons/fa';
import { SiCplusplus } from 'react-icons/si';

const getFileIcon = (name) => {
  if (name.endsWith('.js')) return <FaJs color="#f7df1e" />;
  if (name.endsWith('.py')) return <FaPython color="#3776ab" />;
  if (name.endsWith('.cpp') || name.endsWith('.c')) return <SiCplusplus color="#00599c" />;
  if (name.endsWith('.html')) return <FaCode color="#e34c26" />;
  return <FaFile color="#ccc" />;
};

const FileTree = ({ data, activeId, onFileClick, onCreate, onDelete, onRename, onDownload }) => {
  /* Open by default to avoid "missing files" confusion, especially for root */
  const [isOpen, setIsOpen] = useState(true);
  const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0 });

  const handleContextMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (data._id !== 'root') setContextMenu({ visible: true, x: e.pageX, y: e.pageY });
  };

  useEffect(() => {
    const handleClick = () => setContextMenu({ ...contextMenu, visible: false });
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, [contextMenu]);

  return (
    <div style={{ marginLeft: '12px' }}>
      <div
        className={`file-node ${activeId === data._id ? 'active' : ''}`}
        onClick={(e) => { e.stopPropagation(); if (data.type === 'folder') setIsOpen(!isOpen); else onFileClick(data); }}
        onContextMenu={handleContextMenu}
      >
        {/* Icon Logic */}
        {data.type === 'folder' ? (isOpen ? <FaFolderOpen color="#dcb67a" /> : <FaFolder color="#dcb67a" />) : getFileIcon(data.name)}

        <span>{data.name}</span>

        {data.type === 'folder' && (
          <span
            onClick={(e) => { e.stopPropagation(); onCreate(data._id); }}
            style={{ marginLeft: 'auto', opacity: 0.5, fontSize: '14px', padding: '0 5px' }}
            title="New File"
          >
            +
          </span>
        )}
      </div>

      {isOpen && data.children && data.children.map(child => (
        <FileTree
          key={child._id}
          data={child}
          activeId={activeId}
          onFileClick={onFileClick}
          onCreate={onCreate}
          onDelete={onDelete}
          onRename={onRename}
          onDownload={onDownload}
        />
      ))}

      {contextMenu.visible && (
        <div style={{ position: 'fixed', top: contextMenu.y, left: contextMenu.x, background: '#1e1e1e', border: '1px solid #333', borderRadius: '4px', padding: '5px', zIndex: 1000, boxShadow: '0 4px 10px rgba(0,0,0,0.5)', minWidth: '120px' }}>
          <div className="ctx-item" onClick={() => onRename(data)} style={ctxStyle}>✏️ Rename</div>
          <div className="ctx-item" onClick={() => onDelete(data._id)} style={ctxStyle}>🗑️ Delete</div>
          {data.type === 'file' && <div className="ctx-item" onClick={() => onDownload(data)} style={ctxStyle}>⬇️ Download</div>}
        </div>
      )}
    </div>
  );
};

const ctxStyle = { padding: '8px 12px', cursor: 'pointer', color: '#e0e0e0', fontSize: '13px', display: 'flex', gap: '8px' };

export default FileTree;