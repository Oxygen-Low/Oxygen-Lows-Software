import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { ImagePlus, Save, Play, Square, Download } from 'lucide-react';

type FrameData = {
  x: number;
  y: number;
  w: number;
  h: number;
  hitbox?: { x: number; y: number; w: number; h: number };
  hurtbox?: { x: number; y: number; w: number; h: number };
};

type Animation = {
  name: string;
  frames: FrameData[];
  fps: number;
};

type Moveset = {
  animations: Record<string, Animation>;
};

export function BattlegroundsCreatorApp() {
  const { session } = useAuth();
  const [activeTab, setActiveTab] = useState('spritesheet');
  
  // Spritesheet Generator State
  const [images, setImages] = useState<(File | { url: string, name: string })[]>([]);
  const [mergedImage, setMergedImage] = useState<string | null>(null);
  const [columns, setColumns] = useState(5);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [showAssetSelector, setShowAssetSelector] = useState(false);
  const [publicAssets, setPublicAssets] = useState<any[]>([]);
  const [storageFiles, setStorageFiles] = useState<any[]>([]);
  
  useEffect(() => {
      const fetchAssets = async () => {
          if (!session?.user) return;
          // Fetch public image assets
          const { data: pubData } = await supabase.from('public_assets').select('*').in('category', ['image']);
          if (pubData) setPublicAssets(pubData);
          
          // Fetch storage files
          const { data: storData } = await supabase.storage.from('Storage').list(session.user.id);
          if (storData) {
              setStorageFiles(storData.filter(f => f.metadata?.mimetype?.startsWith('image/')));
          }
      };
      fetchAssets();
  }, [session]);

  // Moveset State
  const [moveset, setMoveset] = useState<Moveset>({ animations: {} });
  const [charName, setCharName] = useState('New Character');
  const [isPublic, setIsPublic] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Handle Spritesheet Generation
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setImages(Array.from(e.target.files));
    }
  };

  const generateSpritesheet = async () => {
    if (images.length === 0 || !canvasRef.current) return;

    const loadedImages = await Promise.all(
      images.map((fileOrUrl) => {
        return new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error("Failed to load image"));
          if (fileOrUrl instanceof File) {
              img.src = URL.createObjectURL(fileOrUrl);
          } else {
              img.src = fileOrUrl.url;
          }
        });
      })
    );

    const maxWidth = Math.max(...loadedImages.map((img) => img.width));
    const maxHeight = Math.max(...loadedImages.map((img) => img.height));
    
    const rows = Math.ceil(loadedImages.length / columns);
    const canvas = canvasRef.current;
    canvas.width = columns * maxWidth;
    canvas.height = rows * maxHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    loadedImages.forEach((img, index) => {
      const col = index % columns;
      const row = Math.floor(index / columns);
      ctx.drawImage(img, col * maxWidth, row * maxHeight);
    });

    setMergedImage(canvas.toDataURL('image/png'));
    toast.success('Spritesheet generated successfully!');
  };

  const handleSaveCharacter = async () => {
    if (!session?.user) {
      toast.error('You must be logged in to save a character.');
      return;
    }
    if (!mergedImage) {
      toast.error('Please generate a spritesheet first.');
      return;
    }

    setIsSaving(true);
    try {
      // 1. Upload base64 image to Supabase Storage
      const base64Data = mergedImage.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(base64Data, 'base64');
      const filename = `${session.user.id}/${Date.now()}_spritesheet.png`;
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('battlegrounds-assets')
        .upload(filename, buffer, {
          contentType: 'image/png',
        });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('battlegrounds-assets')
        .getPublicUrl(filename);

      // 2. Save character to database
      const { data: newChar, error: dbError } = await supabase
        .from('battlegrounds_characters')
        .insert({
          user_id: session.user.id,
          name: charName,
          is_public: false, // Must be verified
          spritesheet_url: urlData.publicUrl,
          moveset_json: moveset,
        }).select().single();

      if (dbError) throw dbError;

      if (isPublic && newChar) {
        // Submit for verification
        await fetch("/api/assets/verifications/submit", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            asset_type: "battlegrounds_character",
            target_type: "public_asset",
            title: charName,
            description: "Battlegrounds character submission",
            original_id: newChar.id,
            metadata: {
              name: charName,
              spritesheet_url: urlData.publicUrl,
              is_battlegrounds: true,
            },
          }),
        });
        toast.success('Character saved and submitted for verification!');
      } else {
        toast.success('Character saved successfully!');
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Failed to save character.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="container mx-auto p-4 max-w-6xl h-full flex flex-col overflow-auto bg-slate-950 text-white rounded-lg border border-slate-800 shadow-xl">
      <div className="flex justify-between items-center mb-6 border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-blue-500">Battlegrounds Creator</h1>
          <p className="text-slate-400 text-sm">Create and publish custom characters for Battlegrounds.</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleSaveCharacter} disabled={isSaving || !mergedImage} className="bg-cyan-600 hover:bg-cyan-500">
            <Save className="w-4 h-4 mr-2" /> {isSaving ? 'Saving...' : 'Publish Character'}
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <TabsList className="grid w-full grid-cols-2 bg-slate-900 border border-slate-800">
          <TabsTrigger value="spritesheet" className="data-[state=active]:bg-cyan-900/40 data-[state=active]:text-cyan-400">1. Spritesheet Generator</TabsTrigger>
          <TabsTrigger value="moveset" className="data-[state=active]:bg-cyan-900/40 data-[state=active]:text-cyan-400">2. Moveset & Hitboxes</TabsTrigger>
        </TabsList>
        
        <TabsContent value="spritesheet" className="flex-1 mt-4 p-4 bg-slate-900/50 rounded-lg border border-slate-800">
          <div className="grid md:grid-cols-2 gap-6 h-full">
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-slate-200 flex items-center"><ImagePlus className="w-5 h-5 mr-2" /> Upload Frames</h2>
              <p className="text-sm text-slate-400">Select multiple images (e.g. idle1.png, idle2.png, attack1.png). They will be merged into a single grid.</p>
              
              <div className="space-y-2 border border-slate-800 p-4 rounded-lg bg-slate-900/50">
                <Label>Cloud Images (Public Assets & Storage)</Label>
                <div className="flex flex-col gap-2 max-h-[150px] overflow-y-auto">
                    {publicAssets.map(pa => (
                        <div key={pa.id} className="flex justify-between items-center text-xs p-1 bg-slate-800 rounded">
                            <span>{pa.display_name || pa.name} (Public)</span>
                            <Button size="sm" variant="outline" className="h-6" onClick={() => {
                                const cleanPath = (pa.file_path || "").replace(/^\/+/, "");
                                const urlData = supabase.storage.from("public-assets").getPublicUrl(cleanPath);
                                setImages(prev => [...prev, { url: urlData.data.publicUrl, name: pa.name }]);
                            }}>Add</Button>
                        </div>
                    ))}
                    {storageFiles.map(sf => (
                        <div key={sf.id} className="flex justify-between items-center text-xs p-1 bg-slate-800 rounded">
                            <span>{sf.name} (Storage)</span>
                            <Button size="sm" variant="outline" className="h-6" onClick={async () => {
                                const { data } = await supabase.storage.from("Storage").createSignedUrl(`${session?.user?.id}/${sf.name}`, 3600);
                                if (data?.signedUrl) {
                                    setImages(prev => [...prev, { url: data.signedUrl, name: sf.name }]);
                                }
                            }}>Add</Button>
                        </div>
                    ))}
                    {publicAssets.length === 0 && storageFiles.length === 0 && (
                        <p className="text-slate-500 text-xs">No image assets found.</p>
                    )}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Local Image Files</Label>
                <Input type="file" multiple accept="image/*" onChange={handleImageUpload} className="bg-slate-800 border-slate-700 text-slate-300" />
                <p className="text-xs text-slate-500">{images.length} frames selected.</p>
              </div>

              <div className="space-y-2">
                <Label>Grid Columns</Label>
                <Input type="number" min={1} value={columns} onChange={(e) => setColumns(parseInt(e.target.value) || 5)} className="bg-slate-800 border-slate-700 text-slate-300 w-32" />
              </div>

              <Button onClick={generateSpritesheet} disabled={images.length === 0} className="w-full bg-slate-800 hover:bg-slate-700">
                Generate Spritesheet
              </Button>
            </div>
            
            <div className="border border-slate-800 rounded-lg bg-slate-900 overflow-auto relative p-4 flex flex-col items-center justify-center min-h-[300px]">
              {mergedImage ? (
                <>
                  <h3 className="absolute top-2 left-2 text-xs font-bold text-slate-500 uppercase">Preview</h3>
                  <img src={mergedImage} alt="Spritesheet preview" className="max-w-full h-auto pixelated" style={{ imageRendering: 'pixelated' }} />
                  <a href={mergedImage} download="spritesheet.png" className="absolute bottom-4 right-4 text-xs bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-md flex items-center transition-colors">
                    <Download className="w-3 h-3 mr-1" /> Download
                  </a>
                </>
              ) : (
                <p className="text-slate-600 text-sm">Upload images and click generate to preview.</p>
              )}
              {/* Hidden canvas for processing */}
              <canvas ref={canvasRef} className="hidden" />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="moveset" className="flex-1 mt-4 p-4 bg-slate-900/50 rounded-lg border border-slate-800">
          <div className="text-center py-12">
            <h2 className="text-xl font-bold text-slate-300 mb-2">Moveset Editor (Coming Soon / Advanced Prototype)</h2>
            <p className="text-slate-400 max-w-lg mx-auto mb-6">
              For this prototype, standard hitboxes and frame timings are auto-generated based on standard grid assumptions. Set your character details below.
            </p>
            
            <div className="max-w-md mx-auto space-y-4 text-left p-6 bg-slate-900 rounded-xl border border-slate-800">
               <div className="space-y-2">
                 <Label>Character Name</Label>
                 <Input value={charName} onChange={(e) => setCharName(e.target.value)} className="bg-slate-800 border-slate-700" />
               </div>
               <div className="flex items-center space-x-2 pt-2">
                 <input type="checkbox" id="isPublic" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} className="rounded border-slate-700 bg-slate-800 text-cyan-500 focus:ring-cyan-500/50" />
                 <Label htmlFor="isPublic">Make Public (Available in Community Roster)</Label>
               </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
