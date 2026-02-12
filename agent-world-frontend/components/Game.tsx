'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as Phaser from 'phaser';
import { supabase } from '../lib/supabaseClient';

const TILE_SIZE = 32;
const GRID_WIDTH = 20;
const GRID_HEIGHT = 15;

class MainScene extends Phaser.Scene {
  agentGroup?: Phaser.GameObjects.Group;
  agentMap: Map<string, Phaser.GameObjects.Container> = new Map();

  constructor() {
    super({ key: 'MainScene' });
  }

  preload() {
    // Placeholder graphics
    const graphics = this.make.graphics({ x: 0, y: 0 });
    
    // Draw floor tile
    graphics.fillStyle(0x444444);
    graphics.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    graphics.lineStyle(1, 0x000000, 0.5);
    graphics.strokeRect(0, 0, TILE_SIZE, TILE_SIZE);
    graphics.generateTexture('floor', TILE_SIZE, TILE_SIZE);

    // Draw agent
    graphics.clear();
    graphics.fillStyle(0x00ff00);
    graphics.fillCircle(TILE_SIZE / 2, TILE_SIZE / 2, TILE_SIZE / 3);
    graphics.generateTexture('agent', TILE_SIZE, TILE_SIZE);
  }

  create() {
    // Create grid
    for (let y = 0; y < GRID_HEIGHT; y++) {
      for (let x = 0; x < GRID_WIDTH; x++) {
        this.add.image(x * TILE_SIZE + TILE_SIZE / 2, y * TILE_SIZE + TILE_SIZE / 2, 'floor');
      }
    }

    this.agentGroup = this.add.group();
  }

  update() {
    // Game loop logic if needed
  }

  updateAgents(agents: { id: string; x: number; y: number; name: string }[]) {
    if (!this.agentGroup) return;

    // Simple reconciliation
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
      const targetX = agent.x * TILE_SIZE + TILE_SIZE / 2;
      const targetY = agent.y * TILE_SIZE + TILE_SIZE / 2;

      if (this.agentMap.has(agent.id)) {
        const container = this.agentMap.get(agent.id)!;
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
        const sprite = this.add.sprite(0, 0, 'agent');
        const text = this.add.text(0, -20, agent.name, { fontSize: '12px', color: '#ffffff' }).setOrigin(0.5);
        
        container.add([sprite, text]);
        this.agentGroup?.add(container);
        this.agentMap.set(agent.id, container);
      }
    });
  }
}

const Game: React.FC = () => {
  const gameContainerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const [agentPositions, setAgentPositions] = useState<{ id: string; x: number; y: number; name: string }[]>([]);

  useEffect(() => {
    if (typeof window !== 'undefined' && gameContainerRef.current && !gameRef.current) {
      const config: Phaser.Types.Core.GameConfig = {
        type: Phaser.AUTO,
        width: GRID_WIDTH * TILE_SIZE,
        height: GRID_HEIGHT * TILE_SIZE,
        parent: gameContainerRef.current,
        backgroundColor: '#2d2d2d',
        physics: {
          default: 'arcade',
          arcade: {
            gravity: { x: 0, y: 0 }, // No gravity for top-down
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
        setAgentPositions(data as any[]);
      }
    };

    fetchAgents(); // Initial fetch
    const interval = setInterval(fetchAgents, 2000); // Poll every 2s

    // Optional: Realtime subscription could go here
    const channel = supabase
      .channel('public:agents')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agents' }, (payload) => {
        // For simplicity, we'll just re-fetch or rely on polling for now, 
        // or update state directly if payload is complete.
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

    // Use getScene to retrieve the running scene instance by key
    const scene = gameRef.current.scene.getScene('MainScene') as MainScene;
    if (scene && scene.updateAgents) {
      scene.updateAgents(agentPositions);
    }
  }, [agentPositions]);

  return (
    <div className="flex flex-col items-center justify-center p-4">
      <h2 className="text-xl font-bold mb-4">Agent World 2D</h2>
      <div ref={gameContainerRef} className="rounded-lg overflow-hidden shadow-2xl" />
      <div className="mt-4 text-sm text-gray-400">
        Active Agents: {agentPositions.length}
      </div>
    </div>
  );
};

export default Game;
