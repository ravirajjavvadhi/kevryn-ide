import React from 'react';
import { FaChevronRight, FaFolder } from 'react-icons/fa';

const Breadcrumbs = ({ fileName }) => {
    if (!fileName) return null;

    const parts = fileName.split('/');

    return (
        <div className="breadcrumbs">
            <FaFolder size={12} className="breadcrumb-icon" />
            {parts.map((p, index) => (
                <React.Fragment key={index}>
                    <span className="breadcrumb-item">{p}</span>
                    {index < parts.length - 1 && <FaChevronRight size={8} className="breadcrumb-separator" />}
                </React.Fragment>
            ))}
        </div>
    );
};

export default Breadcrumbs;
