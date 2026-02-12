'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as Phaser from 'phaser';
import { supabase } from '../lib/supabaseClient';

const TILE_SIZE = 32;
const GRID_WIDTH = 20;
const GRID_HEIGHT = 15;
const CANVAS_WIDTH = GRID_WIDTH * TILE_SIZE;
const CANVAS_HEIGHT = GRID_HEIGHT * TILE_SIZE;

// Colors
const COLOR_BG = 0x050510;
const COLOR_GRID_DOT = 0x1e293b;
const COLOR_QUADRANT_LINE = 0x06b6d4;
const COLOR_TEXT_GLOW = '#22d3ee';

// Agent specific configuration
const AGENT_CONFIG: Record<string, { color: number; label: string }> = {
  'Echo': { color: 0x3b82f6, label: 'ECHO' },    // Blue
  'Stack': { color: 0xeab308, label: 'STACK' },  // Yellow
  'Ship': { color: 0xf97316, label: 'SHIP' },    // Orange
  'Dash': { color: 0xa855f7, label: 'DASH' },    // Purple
  'Pixel': { color: 0x22c55e, label: 'PIXEL' },  // Green
  'Pulse': { color: 0x06b6d4, label: 'PULSE' },  // Cyan
  'Probe': { color: 0xef4444, label: 'PROBE' },  // Red
};

const DEFAULT_AGENT_COLOR = 0x9ca3af; // Gray

// Helper to draw a pixel character
function drawPixelChar(graphics: Phaser.GameObjects.Graphics, color: number) {
  graphics.fillStyle(color, 1);
  
  // Pixel size for the avatar
  const p = 2; 
  
  // Layout (8x8 grid roughly)
  // Head (3x3 center)
  graphics.fillRect(2*p, 0*p, 4*p, 3*p); // Top head
  
  // Eyes (white pixels)
  graphics.fillStyle(0xffffff, 1);
  graphics.fillRect(3*p, 1*p, 1*p, 1*p); // Left eye
  graphics.fillRect(5*p, 1*p, 1*p, 1*p); // Right eye
  
  // Body (color)
  graphics.fillStyle(color, 1);
  graphics.fillRect(1*p, 3*p, 6*p, 4*p); // Torso
  
  // Arms
  graphics.fillRect(0*p, 3*p, 1*p, 3*p); // Left arm
  graphics.fillRect(7*p, 3*p, 1*p, 3*p); // Right arm
  
  // Legs
  graphics.fillRect(2*p, 7*p, 1*p, 3*p); // Left leg
  graphics.fillRect(5*p, 7*p, 1*p, 3*p); // Right leg
}

class MainScene extends Phaser.Scene {
  agentGroup?: Phaser.GameObjects.Group;
  agentMap: Map<string, Phaser.GameObjects.Container> = new Map();
  connectionGraphics?: Phaser.GameObjects.Graphics;

  constructor() {
    super({ key: 'MainScene' });
  }

  preload() {
    // Generate Character Textures
    const graphics = this.make.graphics({ x: 0, y: 0 });

    Object.keys(AGENT_CONFIG).forEach(key => {
      const config = AGENT_CONFIG[key];
      graphics.clear();
      drawPixelChar(graphics, config.color);
      graphics.generateTexture(`agent-${key}`, 32, 32); // Scale up to tile size roughly
    });

    // Default Texture
    graphics.clear();
    drawPixelChar(graphics, DEFAULT_AGENT_COLOR);
    graphics.generateTexture('agent-default', 32, 32);

    // Dot Grid Texture
    graphics.clear();
    graphics.fillStyle(COLOR_GRID_DOT, 0.5);
    graphics.fillCircle(2, 2, 1); // Tiny dot
    graphics.generateTexture('grid-dot', 4, 4);
  }

  create() {
    // 1. Background
    this.cameras.main.setBackgroundColor('#050510');

    // 2. Draw Subtle Dot Grid
    for (let y = 0; y < GRID_HEIGHT; y++) {
      for (let x = 0; x < GRID_WIDTH; x++) {
        if ((x + y) % 2 === 0) { // Checkered pattern for sparseness or fill all
             this.add.image(x * TILE_SIZE + TILE_SIZE / 2, y * TILE_SIZE + TILE_SIZE / 2, 'grid-dot').setAlpha(0.3);
        }
      }
    }

    // 3. Draw Tech Quadrants
    const graphics = this.add.graphics();
    graphics.lineStyle(1, COLOR_QUADRANT_LINE, 0.3);
    
    const midX = CANVAS_WIDTH / 2;
    const midY = CANVAS_HEIGHT / 2;

    // Cross lines
    graphics.moveTo(midX, 20);
    graphics.lineTo(midX, CANVAS_HEIGHT - 20);
    graphics.moveTo(20, midY);
    graphics.lineTo(CANVAS_WIDTH - 20, midY);
    graphics.strokePath();

    // "Tech" Corners for Quadrants
    const cornerSize = 10;
    graphics.lineStyle(2, COLOR_QUADRANT_LINE, 0.6);
    
    // Center Cross Corners
    // Top-Left of center
    graphics.beginPath();
    graphics.moveTo(midX - cornerSize, midY);
    graphics.lineTo(midX + cornerSize, midY);
    graphics.moveTo(midX, midY - cornerSize);
    graphics.lineTo(midX, midY + cornerSize);
    graphics.strokePath();

    // 4. Quadrant Labels (VT323 Font)
    const labelStyle = { 
        fontSize: '20px', 
        fontFamily: '"VT323", monospace', 
        color: '#06b6d4',
        shadow: { offsetX: 0, offsetY: 0, color: '#06b6d4', blur: 4, stroke: true, fill: true }
    };
    
    const labelAlpha = 0.4;
    this.add.text(40, 40, 'SEC:WORKSPACE', labelStyle).setAlpha(labelAlpha);
    this.add.text(midX + 40, 40, 'SEC:CABIN', labelStyle).setAlpha(labelAlpha);
    this.add.text(40, midY + 40, 'SEC:CODE_LAB', labelStyle).setAlpha(labelAlpha);
    this.add.text(midX + 40, midY + 40, 'SEC:PULSE_BAY', labelStyle).setAlpha(labelAlpha);

    // 5. Agent Group & Connections
    this.agentGroup = this.add.group();
    this.connectionGraphics = this.add.graphics();
  }

  updateAgents(agents: { id: string; x: number; y: number; name: string; status?: string }[]) {
    if (!this.agentGroup || !this.connectionGraphics) return;

    // Reconciliation
    const currentIds = new Set(agents.map(a => a.id));

    // Remove missing
    for (const [id, container] of this.agentMap) {
      if (!currentIds.has(id)) {
        container.destroy();
        this.agentMap.delete(id);
      }
    }

    // Add or update
    agents.forEach(agent => {
      let textureKey = 'agent-default';
      let agentColor = DEFAULT_AGENT_COLOR;
      
      const configKey = Object.keys(AGENT_CONFIG).find(k => agent.name.includes(k));
      if (configKey) {
        textureKey = `agent-${configKey}`;
        agentColor = AGENT_CONFIG[configKey].color;
      }

      const targetX = agent.x * TILE_SIZE + TILE_SIZE / 2;
      const targetY = agent.y * TILE_SIZE + TILE_SIZE / 2;
      const statusText = agent.status || 'IDLE';

      if (this.agentMap.has(agent.id)) {
        const container = this.agentMap.get(agent.id)!;
        
        // Update Status
        const statusLabel = container.getByName('statusText') as Phaser.GameObjects.Text;
        if (statusLabel) statusLabel.setText(statusText.toUpperCase());

        // Update Name
        const nameLabel = container.getByName('nameText') as Phaser.GameObjects.Text;
        if (nameLabel) nameLabel.setText(agent.name.toUpperCase());

        // Smooth Move
        this.tweens.add({
          targets: container,
          x: targetX,
          y: targetY,
          duration: 600,
          ease: 'Cubic.easeOut'
        });
      } else {
        const container = this.add.container(targetX, targetY);
        
        // 1. Pixel Avatar (Scaled up slightly)
        const sprite = this.add.sprite(0, 0, textureKey).setScale(1.5);
        
        // 2. Name Label (Pixel Font)
        const nameLabel = this.add.text(0, 22, agent.name.toUpperCase(), { 
          fontSize: '14px', 
          fontFamily: '"VT323", monospace',
          color: '#ffffff',
          backgroundColor: '#000000'
        }).setOrigin(0.5).setPadding(2, 0).setName('nameText');

        // 3. Status Bubble (Holographic)
        const bubbleContainer = this.add.container(0, -35);
        
        const bubbleGfx = this.add.graphics();
        bubbleGfx.fillStyle(0x000000, 0.8);
        bubbleGfx.lineStyle(1, agentColor, 0.6);
        bubbleGfx.fillRoundedRect(-30, -10, 60, 20, 4);
        bubbleGfx.strokeRoundedRect(-30, -10, 60, 20, 4);
        
        const bubbleText = this.add.text(0, 0, statusText.toUpperCase(), {
          fontSize: '12px',
          fontFamily: '"VT323", monospace',
          color: '#' + agentColor.toString(16),
        }).setOrigin(0.5).setName('statusText');
        
        // Add Glow to text
        bubbleText.setShadow(0, 0, '#' + agentColor.toString(16), 4, true, true);

        bubbleContainer.add([bubbleGfx, bubbleText]);
        
        // Add hover effect container maybe? For now just static.
        
        container.add([sprite, nameLabel, bubbleContainer]);
        this.agentGroup?.add(container);
        this.agentMap.set(agent.id, container);
      }
    });

    this.drawConnections(agents);
  }

  drawConnections(agents: { id: string; x: number; y: number; name: string }[]) {
    if (!this.connectionGraphics) return;

    this.connectionGraphics.clear();
    
    // Example: Connect 'Echo' to 'Stack', or any logic.
    // Let's chain them based on mock data or index for visual effect if specific logic isn't provided.
    // Or just random connections for "activity" feel.
    // Let's stick to the prompt's implied desire for elegance.
    
    // For demo: Connect all agents to a central "hub" agent if it exists, or just chain 0->1->2
    if (agents.length < 2) return;

    this.connectionGraphics.lineStyle(2, 0x06b6d4, 0.3); // Faint cyan base

    for (let i = 0; i < agents.length - 1; i++) {
        const startAgent = agents[i];
        const endAgent = agents[i + 1];

        const startX = startAgent.x * TILE_SIZE + TILE_SIZE / 2;
        const startY = startAgent.y * TILE_SIZE + TILE_SIZE / 2;
        const endX = endAgent.x * TILE_SIZE + TILE_SIZE / 2;
        const endY = endAgent.y * TILE_SIZE + TILE_SIZE / 2;

        // Draw Bezier Curve
        const midX = (startX + endX) / 2;
        // const midY = (startY + endY) / 2;
        
        // Control point creates the arc. 
        // Let's make it arc upwards or downwards depending on index to avoid overlap
        const offset = (i % 2 === 0) ? -50 : 50;
        
        const curve = new Phaser.Curves.CubicBezier(
            new Phaser.Math.Vector2(startX, startY),
            new Phaser.Math.Vector2(midX, startY + offset), // CP1
            new Phaser.Math.Vector2(midX, endY + offset),   // CP2
            new Phaser.Math.Vector2(endX, endY)
        );

        // Draw the curve with dashed effect (simulated with points)
        const points = curve.getPoints(20);
        
        this.connectionGraphics.lineStyle(1, 0x06b6d4, 0.4);
        
        // Manual dash implementation for curves
        for(let j = 0; j < points.length - 1; j += 2) {
             this.connectionGraphics.strokeLineShape(
                 new Phaser.Geom.Line(points[j].x, points[j].y, points[j+1].x, points[j+1].y)
             );
        }

        // Draw moving data packets (optional visual flair)
        // Just a static dot on midpoint for now
        // const midPoint = curve.getPoint(0.5);
        // this.connectionGraphics.fillStyle(0xffffff, 0.8);
        // this.connectionGraphics.fillCircle(midPoint.x, midPoint.y, 2);
    }
  }
}

const Game: React.FC = () => {
  const gameContainerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const [agentPositions, setAgentPositions] = useState<{ id: string; x: number; y: number; name: string; status?: string }[]>([]);

  useEffect(() => {
    if (typeof window !== 'undefined' && gameContainerRef.current && !gameRef.current) {
      const config: Phaser.Types.Core.GameConfig = {
        type: Phaser.AUTO,
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
        parent: gameContainerRef.current,
        backgroundColor: '#050510',
        pixelArt: true, // Crucial for 8-bit look
        physics: {
          default: 'arcade',
          arcade: {
            gravity: { x: 0, y: 0 },
          },
        },
        scene: MainScene,
      };

      gameRef.current = new Phaser.Game(config);
    }

    return () => {
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
    };
  }, []);

  // Poll for agent positions from Supabase
  useEffect(() => {
    const fetchAgents = async () => {
      const { data, error } = await supabase
        .from('agents')
        .select('id, name, x, y');
      
      if (error) {
        console.error('Error fetching agents:', error);
      } else if (data) {
        // Enhance with mock status for visualization if not in DB
        const enhancedData = data.map((agent: any) => ({
            ...agent,
            status: getMockStatus(agent.name)
        }));
        setAgentPositions(enhancedData);
      }
    };

    fetchAgents(); // Initial fetch
    const interval = setInterval(fetchAgents, 2000); // Poll every 2s

    const channel = supabase
      .channel('public:agents')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agents' }, (payload) => {
        fetchAgents();
      })
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, []);

  // Update Phaser sprites based on React state
  useEffect(() => {
    if (!gameRef.current) return;

    const scene = gameRef.current.scene.getScene('MainScene') as MainScene;
    if (scene && scene.updateAgents) {
      scene.updateAgents(agentPositions);
    }
  }, [agentPositions]);

  return (
    <div className="flex flex-col items-center justify-center p-6 bg-[#020205] min-h-screen font-vt323">
      <div className="flex justify-between w-[640px] mb-2 text-cyan-400 opacity-80">
          <h2 className="text-2xl font-bold tracking-widest text-shadow-glow">SYS_MONITOR_V2.0</h2>
          <div className="text-right text-lg animate-pulse">LIVE_FEED_ACTIVE</div>
      </div>
      
      <div className="relative p-2 bg-[#0a0a15] rounded-lg border border-cyan-900 shadow-[0_0_20px_rgba(6,182,212,0.15)]">
          {/* CRT Scanline Effect Overlay (Optional CSS) */}
          <div className="pointer-events-none absolute inset-0 z-10 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_2px,3px_100%] opacity-20"></div>
          
          <div ref={gameContainerRef} className="rounded overflow-hidden" />
      </div>

      <div className="mt-6 flex w-[640px] gap-8 text-lg text-cyan-700 font-mono">
        <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-ping"></span>
            ACTIVE_NODES: {agentPositions.length}
        </div>
        <div className="flex-1 text-right">
            NET_LATENCY: 24ms
        </div>
      </div>
    </div>
  );
};

// Helper for mock status
function getMockStatus(name: string): string {
    const statuses = ['SCANNING', 'COMPILING', 'IDLE', 'UPLOADING', 'SYNCING', 'DEBUGGING'];
    // Quasi-random but stable status per name length to avoid jitter
    const index = (name.length + Math.floor(Date.now() / 5000)) % statuses.length;
    return statuses[index];
}

export default Game;
