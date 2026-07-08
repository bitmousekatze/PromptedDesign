import React, { useRef, useState, useEffect } from 'react';
import { motion } from 'framer-motion';

// A simple utility for conditional class names
export function cn(...classes) {
  return classes.filter(Boolean).join(' ');
}

export const Stories = ({ className, children, style, ...props }) => (
  <div
    className={cn('lp-stories-wrap', className)}
    style={{ width: '100%', ...style }}
    {...props}
  >
    {children}
  </div>
);

export const StoriesContent = ({
  className,
  children,
  style,
  ...props
}) => (
  <div 
    className={cn('lp-stories-content hide-scroll', className)} 
    style={{ 
      display: 'flex', 
      gap: '16px', 
      overflowX: 'auto', 
      overflowY: 'hidden',
      scrollSnapType: 'x mandatory', 
      padding: '16px 16px 32px 16px',
      scrollbarWidth: 'none', 
      msOverflowStyle: 'none',
      ...style 
    }}
    {...props} 
  >
    <style dangerouslySetInnerHTML={{__html: `
      .hide-scroll::-webkit-scrollbar {
        display: none;
      }
      .lp-story-card {
        transition: all 0.3s ease;
      }
      @media (hover: hover) {
        .lp-story-card:hover {
          transform: translateY(-8px);
        }
      }
      .lp-story-glow {
        transition: opacity 0.3s ease;
      }
    `}} />
    <div style={{ display: 'flex', gap: '16px' }}>
      {children}
    </div>
  </div>
);

export const Story = ({ className, children, style, ...props }) => (
  <div className={cn("lp-story-wrapper", className)} style={{ position: 'relative', scrollSnapAlign: 'center', flexShrink: 0, width: '260px', zIndex: 1, ...style }}>
    <style dangerouslySetInnerHTML={{__html: `
      @keyframes randomWander {
        0% { transform: translate(0px, 0px) scale(1); }
        10% { transform: translate(-80px, 40px) scale(1.1); }
        20% { transform: translate(-30px, 120px) scale(0.9); }
        30% { transform: translate(-120px, 160px) scale(1.2); }
        40% { transform: translate(-10px, 80px) scale(0.8); }
        50% { transform: translate(-90px, 10px) scale(1); }
        60% { transform: translate(-50px, 180px) scale(1.1); }
        70% { transform: translate(-140px, 90px) scale(0.9); }
        80% { transform: translate(-20px, 140px) scale(1.2); }
        90% { transform: translate(-70px, 30px) scale(1); }
        100% { transform: translate(0px, 0px) scale(1); }
      }
      @keyframes floorWander {
        0% { transform: translateX(0px) scale(1); opacity: 0.3; }
        10% { transform: translateX(-64px) scale(1.1); opacity: 0.8; }
        20% { transform: translateX(-24px) scale(0.9); opacity: 0.5; }
        30% { transform: translateX(-96px) scale(1.2); opacity: 0.8; }
        40% { transform: translateX(-8px) scale(0.8); opacity: 0.4; }
        50% { transform: translateX(-72px) scale(1); opacity: 0.7; }
        60% { transform: translateX(-40px) scale(1.1); opacity: 0.5; }
        70% { transform: translateX(-112px) scale(0.9); opacity: 0.8; }
        80% { transform: translateX(-16px) scale(1.2); opacity: 0.4; }
        90% { transform: translateX(-56px) scale(1); opacity: 0.6; }
        100% { transform: translateX(0px) scale(1); opacity: 0.3; }
      }
      .lp-story-card {
        transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
        z-index: 2;
        box-shadow: 
          inset 0 6px 16px rgba(255, 255, 255, 0.1),
          inset 0 -16px 32px rgba(0, 0, 0, 0.6),
          inset 0 0 16px rgba(255, 255, 255, 0.05),
          0 12px 32px rgba(0, 0, 0, 0.2);
        backdrop-filter: blur(32px);
        -webkit-backdrop-filter: blur(32px);
      }
      @media (hover: hover) {
        .lp-story-wrapper:hover .lp-story-card {
          transform: translateY(-8px);
          box-shadow: 
            inset 0 8px 24px rgba(255, 255, 255, 0.15),
            inset 0 -20px 40px rgba(0, 0, 0, 0.7),
            inset 0 0 20px rgba(255, 255, 255, 0.08),
            0 25px 50px -12px rgba(0, 0, 0, 0.6);
          border-color: rgba(255, 255, 255, 0.05) !important;
        }
      }
      .lp-story-glow {
        transition: opacity 0.5s ease;
        animation: randomWander 20s ease-in-out infinite;
        animation-play-state: paused;
        animation-delay: var(--anim-delay, 0s);
      }
      @media (hover: hover) {
        .lp-story-wrapper:hover .lp-story-glow {
          opacity: 0.6 !important;
          animation-play-state: running;
        }
      }
      .lp-story-underglow-wrapper {
        position: absolute;
        inset: 0;
        z-index: 3;
        opacity: 0;
        transition: opacity 0.5s ease;
        pointer-events: none;
      }
      @media (hover: hover) {
        .lp-story-wrapper:hover .lp-story-underglow-wrapper {
          opacity: 1;
        }
      }
      .lp-story-underglow {
        position: absolute;
        bottom: -24px; 
        left: 15%;
        width: 70%; 
        height: 24px;
        border-radius: 50%;
        background: var(--community-tone);
        filter: blur(16px);
        animation: floorWander 20s ease-in-out infinite;
        animation-play-state: paused;
        animation-delay: var(--anim-delay, 0s);
      }
      @media (hover: hover) {
        .lp-story-wrapper:hover .lp-story-underglow {
          animation-play-state: running;
        }
      }
    `}} />
    <div className="lp-story-underglow-wrapper">
      <div className="lp-story-underglow" />
    </div>
    <div
      className="lp-story-card"
      style={{
        position: 'relative',
        zIndex: 2,
        overflow: 'hidden',
        borderRadius: '24px',
        backgroundColor: 'rgba(255, 255, 255, 0.02)',
        border: '1px solid rgba(255, 255, 255, 0.03)',
        height: '380px',
        cursor: 'pointer',
      }}
      role="button"
      tabIndex={0}
      {...props}
    >
      {children}
    </div>
  </div>
);
