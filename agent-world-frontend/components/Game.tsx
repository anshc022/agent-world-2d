'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as Phaser from 'phaser';
import { supabase } from '../lib/supabaseClient';

const TILE_SIZE = 32;
const GRID_WIDTH = 20;
const GRID_HEIGHT = 15;
const CANVAS_WIDTH = GRID_WIDTH * TILE_SIZE;
const CANVAS_HEIGHT = GRID_HEIGHT * TILE_SIZE;

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

class MainScene extends Phaser.Scene {
  agentGroup?: Phaser.GameObjects.Group;
  agentMap: Map<string, Phaser.GameObjects.Container> = new Map();
  connectionGraphics?: Phaser.GameObjects.Graphics;

  constructor() {
    super({ key: 'MainScene' });
  }

  preload() {
    // 1. Generate textures for each agent type
    const graphics = this.make.graphics({ x: 0, y: 0 });

    Object.keys(AGENT_CONFIG).forEach(key => {
      const config = AGENT_CONFIG[key];
      graphics.clear();
      
      // Main body (Rectangle/Sprite)
      graphics.fillStyle(config.color);
      graphics.fillRoundedRect(0, 0, TILE_SIZE - 8, TILE_SIZE - 8, 4);
      
      // Inner detail (a lighter dot)
      graphics.fillStyle(0xffffff, 0.3);
      graphics.fillCircle((TILE_SIZE - 8) / 2, (TILE_SIZE - 8) / 2, 4);

      graphics.generateTexture(`agent-${key}`, TILE_SIZE - 8, TILE_SIZE - 8);
    });

    // Default texture
    graphics.clear();
    graphics.fillStyle(DEFAULT_AGENT_COLOR);
    graphics.fillRoundedRect(0, 0, TILE_SIZE - 8, TILE_SIZE - 8, 4);
    graphics.generateTexture('agent-default', TILE_SIZE - 8, TILE_SIZE - 8);

    // Floor Grid Texture (faint cyan)
    graphics.clear();
    graphics.lineStyle(1, 0x06b6d4, 0.1); // Cyan, low opacity
    graphics.strokeRect(0, 0, TILE_SIZE, TILE_SIZE);
    graphics.generateTexture('grid-tile', TILE_SIZE, TILE_SIZE);
  }

  create() {
    // 1. Background
    this.cameras.main.setBackgroundColor('#0a0a1a');

    // 2. Draw Grid
    for (let y = 0; y < GRID_HEIGHT; y++) {
      for (let x = 0; x < GRID_WIDTH; x++) {
        this.add.image(x * TILE_SIZE + TILE_SIZE / 2, y * TILE_SIZE + TILE_SIZE / 2, 'grid-tile');
      }
    }

    // 3. Draw Quadrants
    const graphics = this.add.graphics();
    graphics.lineStyle(2, 0x06b6d4, 0.3); // Cyan lines
    const midX = CANVAS_WIDTH / 2;
    const midY = CANVAS_HEIGHT / 2;

    // Vertical divider
    graphics.moveTo(midX, 0);
    graphics.lineTo(midX, CANVAS_HEIGHT);

    // Horizontal divider
    graphics.moveTo(0, midY);
    graphics.lineTo(CANVAS_WIDTH, midY);
    graphics.strokePath();

    // 4. Quadrant Labels
    const labelStyle = { fontSize: '24px', fontFamily: 'monospace', color: 'rgba(6, 182, 212, 0.2)', fontStyle: 'bold' };
    
    // Top-Left: WORKSPACE
    this.add.text(midX / 2, midY / 2, 'WORKSPACE', labelStyle).setOrigin(0.5);
    
    // Top-Right: CABIN
    this.add.text(midX + midX / 2, midY / 2, 'CABIN', labelStyle).setOrigin(0.5);

    // Bottom-Left: CODE LAB
    this.add.text(midX / 2, midY + midY / 2, 'CODE LAB', labelStyle).setOrigin(0.5);

    // Bottom-Right: PULSE BAY
    this.add.text(midX + midX / 2, midY + midY / 2, 'PULSE BAY', labelStyle).setOrigin(0.5);

    // Group for agents
    this.agentGroup = this.add.group();
    
    // Graphics object for connections (drawn every frame or update)
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
      // Determine texture based on name (simple includes check or direct match)
      let textureKey = 'agent-default';
      const nameKey = Object.keys(AGENT_CONFIG).find(k => agent.name.includes(k));
      if (nameKey) textureKey = `agent-${nameKey}`;

      const targetX = agent.x * TILE_SIZE + TILE_SIZE / 2;
      const targetY = agent.y * TILE_SIZE + TILE_SIZE / 2;
      
      // Default status if missing
      const statusText = agent.status || 'Idling...';

      if (this.agentMap.has(agent.id)) {
        const container = this.agentMap.get(agent.id)!;
        
        // Update status text if needed
        const statusBubble = container.getByName('statusText') as Phaser.GameObjects.Text;
        if (statusBubble) statusBubble.setText(statusText);

        // Tween to new position
        this.tweens.add({
          targets: container,
          x: targetX,
          y: targetY,
          duration: 500,
          ease: 'Power2'
        });
      } else {
        const container = this.add.container(targetX, targetY);
        
        // Agent Sprite
        const sprite = this.add.sprite(0, 0, textureKey);
        
        // Name Label
        const nameLabel = this.add.text(0, 20, agent.name, { 
          fontSize: '10px', 
          color: '#ffffff',
          fontFamily: 'monospace'
        }).setOrigin(0.5);

        // Status Bubble
        const bubbleContainer = this.add.container(0, -25);
        const bubbleBg = this.add.graphics();
        bubbleBg.fillStyle(0x000000, 0.7);
        bubbleBg.lineStyle(1, 0x06b6d4, 0.8);
        bubbleBg.fillRoundedRect(-40, -10, 80, 20, 4);
        bubbleBg.strokeRoundedRect(-40, -10, 80, 20, 4);
        
        const bubbleText = this.add.text(0, 0, statusText, {
          fontSize: '10px',
          color: '#00ffff',
          fontFamily: 'monospace'
        }).setOrigin(0.5).setName('statusText'); // Named for easy retrieval
        
        bubbleContainer.add([bubbleBg, bubbleText]);

        container.add([sprite, nameLabel, bubbleContainer]);
        this.agentGroup?.add(container);
        this.agentMap.set(agent.id, container);
      }
    });

    // Draw connections
    this.drawConnections(agents);
  }

  drawConnections(agents: { id: string; x: number; y: number; name: string }[]) {
    if (!this.connectionGraphics) return;

    this.connectionGraphics.clear();
    
    // Mock connections logic: Draw lines between agents that are close or specific pairs
    // For demo: Connect "Echo" and "Stack" if both exist
    const echo = agents.find(a => a.name.includes('Echo'));
    const stack = agents.find(a => a.name.includes('Stack'));

    if (echo && stack) {
        const startX = echo.x * TILE_SIZE + TILE_SIZE / 2;
        const startY = echo.y * TILE_SIZE + TILE_SIZE / 2;
        const endX = stack.x * TILE_SIZE + TILE_SIZE / 2;
        const endY = stack.y * TILE_SIZE + TILE_SIZE / 2;

        this.connectionGraphics.lineStyle(2, 0x06b6d4, 0.5); // Cyan dashed
        
        // Phaser doesn't support native dashed lines easily in WebGL without texture, 
        // but we can draw a simple line for now or simulate dots.
        // Let's draw a simple line with lower alpha to look "holographic"
        this.connectionGraphics.lineStyle(1, 0x00ffff, 0.4);
        this.connectionGraphics.beginPath();
        this.connectionGraphics.moveTo(startX, startY);
        this.connectionGraphics.lineTo(endX, endY);
        this.connectionGraphics.strokePath();

        // Draw small nodes on line
        const midX = (startX + endX) / 2;
        const midY = (startY + endY) / 2;
        this.connectionGraphics.fillStyle(0x00ffff, 0.8);
        this.connectionGraphics.fillCircle(midX, midY, 2);
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
        backgroundColor: '#0a0a1a',
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
    <div className="flex flex-col items-center justify-center p-4 bg-gray-900 min-h-screen">
      <h2 className="text-2xl font-mono font-bold mb-4 text-cyan-400 tracking-wider">SYSTEM MONITOR // 2D VIEW</h2>
      <div className="relative p-1 bg-gradient-to-br from-cyan-900 to-blue-900 rounded-lg shadow-[0_0_15px_rgba(6,182,212,0.3)]">
          <div ref={gameContainerRef} className="rounded border border-cyan-800" />
      </div>
      <div className="mt-4 flex gap-4 text-sm font-mono text-cyan-600">
        <div>ACTIVE_NODES: {agentPositions.length}</div>
        <div>NET_STATUS: ONLINE</div>
      </div>
    </div>
  );
};

// Helper for mock status
function getMockStatus(name: string): string {
    const statuses = ['Scanning...', 'Compiling...', 'Idle', 'Uploading', 'Syncing'];
    // Deterministic mock status based on name length for stability, or random
    return statuses[name.length % statuses.length];
}

export default Game;
