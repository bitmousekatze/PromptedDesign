import React, { useEffect, useRef } from 'react';
import { CommunityIcon } from './icons.jsx';

// Community Selector Component (for posting to a community)
const CommunitySelector = ({ userCommunities, selectedCommunityIds = [], onSelect, preSelectedCommunityId = null, isOpen = false, onOpenChange = () => {} }) => {
  const dropdownRef = useRef(null);
  const selectedCommunities = userCommunities.filter(c => selectedCommunityIds.includes(c.id));

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        onOpenChange(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onOpenChange]);

  const toggleCommunity = (communityId) => {
    if (selectedCommunityIds.includes(communityId)) {
      // Don't allow deselecting the pre-selected community
      if (communityId === preSelectedCommunityId) return;
      onSelect(selectedCommunityIds.filter(id => id !== communityId));
    } else {
      onSelect([...selectedCommunityIds, communityId]);
    }
  };

  return (
    <div className="community-selector" style={{ position: 'relative' }} ref={dropdownRef}>
      <button
        type="button"
        className={`community-selector-toggle ${selectedCommunityIds.length > 0 ? 'selected' : ''}`}
        onClick={() => onOpenChange(!isOpen)}
      >
        <span className="community-selector-icon">
          {selectedCommunities.length > 0 ? (
            selectedCommunities[0].icon_url ? (
              <img src={selectedCommunities[0].icon_url} alt="" style={{ width: '24px', height: '24px', objectFit: 'cover', borderRadius: '6px' }} />
            ) : (
              selectedCommunities[0].icon || '🌟'
            )
          ) : <CommunityIcon />}
        </span>
        <span className="community-selector-text">
          {selectedCommunities.length === 0
            ? 'Post to communities (optional)'
            : selectedCommunities.length === 1
              ? selectedCommunities[0].name
              : `${selectedCommunities.length} communities selected`}
        </span>
        <span style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
          ▼
        </span>
      </button>

      {isOpen && (
        <div className="community-selector-dropdown">
          <div className="community-selector-hint" style={{ padding: '0.5rem 1rem', color: 'var(--text-muted)', fontSize: '0.8rem', borderBottom: '1px solid var(--border-color)' }}>
            Select communities to post to
          </div>
          {userCommunities.map(community => {
            const isSelected = selectedCommunityIds.includes(community.id);
            const isPreSelected = community.id === preSelectedCommunityId;
            return (
              <div
                key={community.id}
                className={`community-selector-option ${isSelected ? 'selected' : ''}`}
                onClick={() => toggleCommunity(community.id)}
                style={{ cursor: isPreSelected ? 'default' : 'pointer' }}
              >
                <span className="community-selector-checkbox" style={{
                  width: '18px',
                  height: '18px',
                  borderRadius: '4px',
                  border: isSelected ? 'none' : '2px solid var(--border-color)',
                  background: isSelected ? 'var(--accent-primary)' : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: '0.5rem',
                  flexShrink: 0
                }}>
                  {isSelected && <span style={{ color: 'white', fontSize: '12px' }}>✓</span>}
                </span>
                <span className="community-selector-option-icon">
                  {community.icon_url ? (
                    <img src={community.icon_url} alt="" style={{ width: '24px', height: '24px', objectFit: 'cover', borderRadius: '6px' }} />
                  ) : (
                    community.icon || '🌟'
                  )}
                </span>
                <span className="community-selector-option-name">{community.name}</span>
                {isPreSelected && (
                  <span style={{
                    marginLeft: 'auto',
                    fontSize: '0.7rem',
                    padding: '0.15rem 0.4rem',
                    background: 'var(--accent-primary)',
                    color: 'white',
                    borderRadius: '4px'
                  }}>Current</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default CommunitySelector;
