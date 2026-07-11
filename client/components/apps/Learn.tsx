import React, { useState, useMemo, useEffect } from "react";
import {
  BookOpen,
  Box,
  ChevronRight,
  ChevronLeft,
  Info,
  Layers,
  Cpu,
  MousePointer2,
  CheckCircle2,
} from "lucide-react";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { cn } from "@/lib/utils";

// --- Types ---

interface Subsection {
  id: string;
  title: string;
  content: string;
  model?: string; // ID of the model to show
}

interface Section {
  id: string;
  title: string;
  content: string;
  subsections?: Subsection[];
}

interface Course {
  id: string;
  name: string;
  description: string;
  category: string;
  subCategory: string;
  subSubCategory: string;
  sections: Section[];
}

// --- Data ---

const COURSES: Course[] = [
  {
    id: "computer-basics",
    name: "Computer Basics",
    description:
      "Learn the fundamentals of how computers work, their components, and operating systems.",
    category: "Computing",
    subCategory: "Basics",
    subSubCategory: "Computer Basics",
    sections: [
      {
        id: "intro",
        title: "Introduction to Computers",
        content:
          "A computer is an electronic device that manipulates information, or data. It has the ability to store, retrieve, and process data. You may already know that you can use a computer to type documents, send email, play games, and browse the Web. You can also use it to edit or create spreadsheets, presentations, and even videos.",
      },
      {
        id: "hardware",
        title: "Hardware Components",
        content:
          "Computer hardware includes the physical parts of a computer. These are the things you can touch. To have a working computer, several key components must work together.",
        subsections: [
          {
            id: "cpu",
            title: "CPU (Central Processing Unit)",
            content:
              "The CPU is often called the 'brain' of the computer. It performs most of the processing inside the computer. It handles all instructions it receives from hardware and software running on the computer. Modern CPUs have multiple 'cores' allowing them to do many things at once.",
            model: "cpu",
          },
          {
            id: "ram",
            title: "RAM (Random Access Memory)",
            content:
              "RAM is your system's short-term memory. Whenever your computer performs calculations, it temporarily stores the data in the RAM until it is needed. This short-term memory disappears when the computer is turned off. More RAM allows more programs to be open simultaneously.",
            model: "ram",
          },
          {
            id: "motherboard",
            title: "Motherboard",
            content:
              "The motherboard is the computer's main circuit board. It's a thin plate that holds the CPU, memory, connectors for the hard drive and optical drives, expansion cards to control the video and audio, and connections to your computer's ports (such as USB ports).",
            model: "motherboard",
          },
          {
            id: "storage",
            title: "Storage (HDD/SSD)",
            content:
              "Unlike RAM, storage is long-term memory. It's where your files, photos, and programs are kept even when the computer is off. SSDs (Solid State Drives) are much faster than older HDDs (Hard Disk Drives).",
            model: "storage",
          },
          {
            id: "psu",
            title: "Power Supply Unit (PSU)",
            content:
              "The PSU converts power from the wall outlet to the type of power needed by the computer. It sends power through cables to the motherboard and other components.",
            model: "psu",
          },
        ],
      },
      {
        id: "software",
        title: "Operating Systems",
        content:
          "An operating system (OS) is the most important software that runs on a computer. It manages the computer's memory and processes, as well as all of its software and hardware. It also allows you to communicate with the computer without knowing how to speak the computer's language.",
        subsections: [
          {
            id: "os-types",
            title: "Common Operating Systems",
            content:
              "The three most common operating systems for personal computers are Microsoft Windows, macOS, and Linux. Modern operating systems use a graphical user interface (GUI) that lets you use your mouse to click icons, buttons, and menus.",
          },
          {
            id: "os-role",
            title: "The OS as a Manager",
            content:
              "The OS acts like a traffic cop, ensuring that different programs don't interfere with each other and that hardware resources like the CPU and RAM are shared fairly among all running applications.",
          },
        ],
      },
    ],
  },
];

// --- 3D Components ---

const ComputerPart = ({
  type,
  onClick,
}: {
  type: string;
  onClick: (info: string) => void;
}) => {
  const handleClick = (e: any, info: string) => {
    e.stopPropagation();
    onClick(info);
  };

  if (type === "cpu") {
    return (
      <group>
        {/* Substrate/PCB */}
        <mesh
          position={[0, 0, 0]}
          onClick={(e) =>
            handleClick(
              e,
              "CPU Substrate: The fiberglass base that connects the die to the pins.",
            )
          }
        >
          <boxGeometry args={[2, 0.1, 2]} />
          <meshStandardMaterial color="#1e3a8a" />
        </mesh>
        {/* Heat Spreader (IHS) */}
        <mesh
          position={[0, 0.1, 0]}
          onClick={(e) =>
            handleClick(
              e,
              "Integrated Heat Spreader (IHS): Protects the silicon die and spreads heat to the cooler.",
            )
          }
        >
          <boxGeometry args={[1.6, 0.15, 1.6]} />
          <meshStandardMaterial
            color="#94a3b8"
            metalness={0.8}
            roughness={0.2}
          />
        </mesh>
        {/* Pins (Underneath) */}
        <mesh
          position={[0, -0.1, 0]}
          onClick={(e) =>
            handleClick(
              e,
              "CPU Pins/Pads: Thousands of electrical contacts that interface with the motherboard socket.",
            )
          }
        >
          <boxGeometry args={[1.8, 0.05, 1.8]} />
          <meshStandardMaterial color="#d4af37" metalness={1} roughness={0.1} />
        </mesh>
        {/* Die (Visible if we "opened" it, but let's keep it realistic) */}
        <mesh position={[0, 0.02, 0]} visible={false}>
          <boxGeometry args={[0.8, 0.05, 0.8]} />
          <meshStandardMaterial color="#111" />
        </mesh>
      </group>
    );
  }

  if (type === "ram") {
    return (
      <group>
        {/* PCB */}
        <mesh
          position={[0, 0, 0]}
          onClick={(e) =>
            handleClick(
              e,
              "RAM PCB: The circuit board that connects memory chips to the system.",
            )
          }
        >
          <boxGeometry args={[4, 1.2, 0.05]} />
          <meshStandardMaterial color="#065f46" />
        </mesh>
        {/* Memory Chips */}
        {[...Array(8)].map((_, i) => (
          <mesh
            key={i}
            position={[-1.75 + i * 0.5, 0.2, 0.05]}
            onClick={(e) =>
              handleClick(
                e,
                "DRAM Chips: Where the actual data is stored temporarily using capacitors.",
              )
            }
          >
            <boxGeometry args={[0.35, 0.6, 0.05]} />
            <meshStandardMaterial color="#111" />
          </mesh>
        ))}
        {/* Gold Contacts */}
        <mesh
          position={[0, -0.55, 0]}
          onClick={(e) =>
            handleClick(
              e,
              "Gold Contacts: High-conductivity pins that interface with the motherboard RAM slots.",
            )
          }
        >
          <boxGeometry args={[3.8, 0.1, 0.06]} />
          <meshStandardMaterial color="#d4af37" metalness={1} roughness={0.1} />
        </mesh>
        {/* SPD Chip */}
        <mesh
          position={[1.5, -0.2, 0.05]}
          onClick={(e) =>
            handleClick(
              e,
              "SPD Chip: Stores timing and speed information for the BIOS.",
            )
          }
        >
          <boxGeometry args={[0.15, 0.15, 0.03]} />
          <meshStandardMaterial color="#222" />
        </mesh>
      </group>
    );
  }

  if (type === "motherboard") {
    return (
      <group rotation={[-Math.PI / 2, 0, 0]}>
        {/* PCB */}
        <mesh
          position={[0, 0, -0.1]}
          onClick={(e) =>
            handleClick(
              e,
              "Motherboard PCB: A multi-layered circuit board with copper traces connecting all components.",
            )
          }
        >
          <boxGeometry args={[5, 6, 0.1]} />
          <meshStandardMaterial color="#064e3b" />
        </mesh>
        {/* CPU Socket */}
        <mesh
          position={[0, 1.5, 0]}
          onClick={(e) =>
            handleClick(
              e,
              "CPU Socket: The interface that holds the CPU and connects it to the rest of the board.",
            )
          }
        >
          <boxGeometry args={[1.5, 1.5, 0.15]} />
          <meshStandardMaterial color="#334155" />
        </mesh>
        {/* RAM Slots */}
        {[...Array(4)].map((_, i) => (
          <mesh
            key={i}
            position={[1.5 + i * 0.3, 1.5, 0]}
            onClick={(e) =>
              handleClick(e, "DIMM Slots: Connectors for RAM modules.")
            }
          >
            <boxGeometry args={[0.1, 3.5, 0.2]} />
            <meshStandardMaterial color="#111" />
          </mesh>
        ))}
        {/* PCIe Slot */}
        <mesh
          position={[0, -1, 0]}
          onClick={(e) =>
            handleClick(
              e,
              "PCIe Slot: High-speed expansion slot for GPUs, SSDs, and other cards.",
            )
          }
        >
          <boxGeometry args={[4, 0.2, 0.2]} />
          <meshStandardMaterial color="#1e3a8a" />
        </mesh>
        <mesh
          position={[0, -2, 0]}
          onClick={(e) =>
            handleClick(e, "PCIe Slot: High-speed expansion slot.")
          }
        >
          <boxGeometry args={[4, 0.2, 0.2]} />
          <meshStandardMaterial color="#1e3a8a" />
        </mesh>
        {/* Chipset / Heatsink */}
        <mesh
          position={[1.5, -1, 0]}
          onClick={(e) =>
            handleClick(
              e,
              "Chipset Heatsink: Cools the chipset that manages communication between CPU and peripherals.",
            )
          }
        >
          <boxGeometry args={[1, 1, 0.3]} />
          <meshStandardMaterial color="#475569" metalness={0.7} />
        </mesh>
        {/* I/O Ports */}
        <mesh
          position={[-2.4, 1.5, 0.4]}
          onClick={(e) =>
            handleClick(
              e,
              "Rear I/O: Ports for USB, Ethernet, Audio, and Video.",
            )
          }
        >
          <boxGeometry args={[0.2, 2.5, 0.8]} />
          <meshStandardMaterial color="#94a3b8" metalness={0.8} />
        </mesh>
      </group>
    );
  }

  if (type === "storage") {
    return (
      <group>
        {/* M.2 SSD PCB */}
        <mesh
          position={[0, 0, 0]}
          onClick={(e) =>
            handleClick(
              e,
              "M.2 SSD PCB: The compact circuit board for modern high-speed storage.",
            )
          }
        >
          <boxGeometry args={[3, 0.8, 0.05]} />
          <meshStandardMaterial color="#1e293b" />
        </mesh>
        {/* NAND Flash Chips */}
        {[...Array(2)].map((_, i) => (
          <mesh
            key={i}
            position={[-0.5 + i * 1, 0, 0.06]}
            onClick={(e) =>
              handleClick(
                e,
                "NAND Flash: Non-volatile memory chips that store your data without power.",
              )
            }
          >
            <boxGeometry args={[0.7, 0.6, 0.05]} />
            <meshStandardMaterial color="#111" />
          </mesh>
        ))}
        {/* Controller */}
        <mesh
          position={[-1.1, 0, 0.06]}
          onClick={(e) =>
            handleClick(
              e,
              "SSD Controller: The processor that manages data placement and retrieval.",
            )
          }
        >
          <boxGeometry args={[0.5, 0.5, 0.05]} />
          <meshStandardMaterial color="#222" />
        </mesh>
        {/* M.2 Key Contacts */}
        <mesh
          position={[1.45, 0, 0]}
          onClick={(e) =>
            handleClick(
              e,
              "M.2 Connector: The interface that plugs into the motherboard M.2 slot.",
            )
          }
        >
          <boxGeometry args={[0.1, 0.7, 0.06]} />
          <meshStandardMaterial color="#d4af37" metalness={1} />
        </mesh>
      </group>
    );
  }

  if (type === "psu") {
    return (
      <group>
        {/* Outer Case */}
        <mesh
          position={[0, 0, 0]}
          onClick={(e) =>
            handleClick(
              e,
              "PSU Case: Metal enclosure that houses high-voltage components and shields EMI.",
            )
          }
        >
          <boxGeometry args={[3, 3, 3]} />
          <meshStandardMaterial color="#111" metalness={0.5} roughness={0.5} />
        </mesh>
        {/* Fan Grille */}
        <mesh
          position={[0, 1.51, 0]}
          onClick={(e) =>
            handleClick(
              e,
              "Intake Fan: Pulls cool air into the PSU to cool internal transformers and capacitors.",
            )
          }
        >
          <cylinderGeometry args={[1.2, 1.2, 0.02, 32]} />
          <meshStandardMaterial color="#333" />
        </mesh>
        {/* Power Socket */}
        <mesh
          position={[0, 0, 1.51]}
          onClick={(e) =>
            handleClick(
              e,
              "AC Inlet: Where the power cord from the wall outlet connects.",
            )
          }
        >
          <boxGeometry args={[1, 0.6, 0.1]} />
          <meshStandardMaterial color="#222" />
        </mesh>
        {/* Modular Cables (Simplified) */}
        <mesh
          position={[0, 0, -1.51]}
          onClick={(e) =>
            handleClick(
              e,
              "Cable Interface: Outputs DC power at 3.3V, 5V, and 12V to the computer.",
            )
          }
        >
          <boxGeometry args={[2.5, 2.5, 0.1]} />
          <meshStandardMaterial color="#111" />
        </mesh>
      </group>
    );
  }

  return null;
};

const ModelViewer = ({ type }: { type: string }) => {
  const [info, setInfo] = useState<string | null>(null);

  return (
    <div className="w-full h-[300px] bg-slate-950 rounded-xl relative overflow-hidden border border-slate-800">
      <Canvas camera={{ position: [5, 5, 5], fov: 50 }}>
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} />
        <ComputerPart type={type} onClick={setInfo} />
        <OrbitControls enableZoom={true} />
      </Canvas>
      <div className="absolute bottom-4 left-4 right-4 pointer-events-none">
        {info ? (
          <div className="bg-cyan-500/90 text-white px-4 py-2 rounded-lg text-sm font-medium animate-in fade-in slide-in-from-bottom-2">
            {info}
          </div>
        ) : (
          <div className="text-slate-500 text-xs flex items-center gap-2">
            <MousePointer2 className="w-3 h-3" />
            Click components to learn more. Drag to rotate.
          </div>
        )}
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-2 right-2 text-slate-500"
        onClick={() => setInfo(null)}
        aria-label="Close information"
        title="Close information"
      >
        <Info className="w-4 h-4" />
      </Button>
    </div>
  );
};

// --- Main Components ---

export function LearnApp() {
  const [view, setView] = useState<"home" | "category" | "course">("home");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedSubCategory, setSelectedSubCategory] = useState<string | null>(
    null,
  );
  const [selectedSubSubCategory, setSelectedSubSubCategory] = useState<
    string | null
  >(null);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);

  const [progress, setProgress] = useState<Record<string, number>>({});

  useEffect(() => {
    const saved = localStorage.getItem("learn_progress");
    if (saved) {
      try {
        setProgress(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to load progress", e);
      }
    }
  }, []);

  const saveProgress = (courseId: string, value: number) => {
    const current = progress[courseId] || 0;
    if (value > current) {
      const newProgress = { ...progress, [courseId]: value };
      setProgress(newProgress);
      localStorage.setItem("learn_progress", JSON.stringify(newProgress));
    }
  };

  const categories = useMemo(() => {
    const cats: Record<string, Record<string, string[]>> = {};
    COURSES.forEach((c) => {
      if (!cats[c.category]) cats[c.category] = {};
      if (!cats[c.category][c.subCategory])
        cats[c.category][c.subCategory] = [];
      if (!cats[c.category][c.subCategory].includes(c.subSubCategory)) {
        cats[c.category][c.subCategory].push(c.subSubCategory);
      }
    });
    return cats;
  }, []);

  const filteredCourses = useMemo(() => {
    return COURSES.filter((c) => {
      if (selectedSubSubCategory)
        return c.subSubCategory === selectedSubSubCategory;
      if (selectedSubCategory) return c.subCategory === selectedSubCategory;
      if (selectedCategory) return c.category === selectedCategory;
      return false;
    });
  }, [selectedCategory, selectedSubCategory, selectedSubSubCategory]);

  const handleCourseClick = (course: Course) => {
    setSelectedCourse(course);
    setView("course");
  };

  const isBrowsing = !!selectedCategory;

  const renderHome = () => (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
        <div>
          <h3 className="text-2xl font-bold text-white">Start Learning</h3>
          <p className="text-slate-400">Choose a category to start learning.</p>
        </div>
      </div>

      {!isBrowsing ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Object.keys(categories).map((cat) => (
            <Card
              key={cat}
              className="bg-slate-900/50 border-slate-800 hover:border-cyan-500/50 transition-all cursor-pointer group"
              onClick={() => {
                setSelectedCategory(cat);
                setView("category");
              }}
            >
              <CardHeader>
                <div className="w-12 h-12 rounded-lg bg-cyan-500/10 flex items-center justify-center mb-4 group-hover:bg-cyan-500/20 transition-colors">
                  <BookOpen className="w-6 h-6 text-cyan-400" />
                </div>
                <CardTitle className="text-white">{cat}</CardTitle>
                <CardDescription>
                  Explore courses in {cat.toLowerCase()}
                </CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex items-center gap-2 text-sm overflow-x-auto pb-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelectedCategory(null);
                setSelectedSubCategory(null);
                setSelectedSubSubCategory(null);
                setSelectedSubCategory(null);
                setSelectedSubSubCategory(null);
              }}
              className="text-slate-400 whitespace-nowrap"
            >
              Home
            </Button>

            {isBrowsing && (
              <>
                <ChevronRight className="w-4 h-4 text-slate-600 shrink-0" />
                <span className="text-slate-500 whitespace-nowrap">
                  Library
                </span>
              </>
            )}

            {selectedCategory && (
              <>
                <ChevronRight className="w-4 h-4 text-slate-600 shrink-0" />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedSubCategory(null);
                    setSelectedSubSubCategory(null);
                  }}
                  className="text-slate-400 whitespace-nowrap"
                >
                  {selectedCategory}
                </Button>
              </>
            )}
            {selectedSubCategory && (
              <>
                <ChevronRight className="w-4 h-4 text-slate-600 shrink-0" />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedSubSubCategory(null);
                  }}
                  className="text-slate-400 whitespace-nowrap"
                >
                  {selectedSubCategory}
                </Button>
              </>
            )}
            {selectedSubSubCategory && (
              <>
                <ChevronRight className="w-4 h-4 text-slate-600 shrink-0" />
                <span className="text-cyan-400 px-3 whitespace-nowrap">
                  {selectedSubSubCategory}
                </span>
              </>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredCourses.length > 0 ? (
              filteredCourses.map((course) => {
                const courseProgress = progress[course.id] || 0;
                const isCompleted = courseProgress >= 95;
                return (
                  <Card
                    key={course.id}
                    className={cn(
                      "bg-slate-900/50 border-slate-800 hover:border-slate-700 transition-all cursor-pointer relative overflow-hidden",
                      courseProgress > 0 && "border-green-500/50",
                    )}
                    onClick={() => handleCourseClick(course)}
                  >
                    {courseProgress > 0 && (
                      <div
                        className="absolute top-0 left-0 h-1 bg-green-500 transition-all duration-500"
                        style={{ width: `${courseProgress}%` }}
                      />
                    )}
                    <CardHeader>
                      <div className="flex justify-between items-start mb-2">
                        <Badge
                          variant="outline"
                          className="text-xs border-slate-700 text-slate-400"
                        >
                          {course.subSubCategory}
                        </Badge>
                        {isCompleted && (
                          <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
                        )}
                      </div>
                      <CardTitle className="text-white text-lg">
                        {course.name}
                      </CardTitle>
                      <CardDescription className="line-clamp-2">
                        {course.description}
                      </CardDescription>
                    </CardHeader>
                  </Card>
                );
              })
            ) : (
              <div className="col-span-full py-20 text-center border-2 border-dashed border-slate-800 rounded-xl">
                <p className="text-slate-500 text-lg">
                  No courses found matching your criteria.
                </p>
                <Button
                  variant="link"
                  className="text-cyan-500 mt-2"
                  onClick={() => {
                    setSelectedCategory(null);
                    setSelectedSubCategory(null);
                    setSelectedSubSubCategory(null);
                  }}
                >
                  Clear filters
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );

  const renderCategoryBrowser = () => {
    if (!selectedCategory) return null;

    const subs = categories[selectedCategory];

    return (
      <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setView("home")}
            className="text-slate-400"
            aria-label="Go back to categories"
            title="Go back to categories"
          >
            <ChevronLeft className="w-6 h-6" />
          </Button>
          <h3 className="text-2xl font-bold text-white">{selectedCategory}</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-12">
          {Object.entries(subs).map(([sub, subSubs]) => (
            <div key={sub} className="space-y-4">
              <h4 className="text-lg font-semibold text-slate-300 flex items-center gap-2">
                <Layers className="w-5 h-5 text-cyan-500" />
                {sub}
              </h4>
              <div className="grid grid-cols-1 gap-2">
                {subSubs.map((ss) => (
                  <Button
                    key={ss}
                    variant="outline"
                    className="justify-start border-slate-800 bg-slate-900/50 hover:bg-slate-800 text-slate-300 h-auto py-3 px-4 transition-colors group"
                    onClick={() => {
                      setSelectedSubCategory(sub);
                      setSelectedSubSubCategory(ss);

                      setView("home");
                    }}
                  >
                    <div className="text-left w-full flex justify-between items-center">
                      <div>
                        <div className="font-medium text-white group-hover:text-cyan-400 transition-colors">
                          {ss}
                        </div>
                        <div className="text-xs text-slate-500">
                          View courses
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-cyan-500 transition-colors" />
                    </div>
                  </Button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderCourseViewer = () => {
    if (!selectedCourse) return null;

    return (
      <div className="animate-in fade-in slide-in-from-right-4 duration-500 h-full flex flex-col">
        <div className="flex items-center justify-between gap-4 mb-6 sticky top-0 bg-slate-950/80 backdrop-blur-md z-10 py-4 border-b border-slate-900">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setView("home")}
              className="text-slate-400"
              aria-label="Go back to courses"
              title="Go back to courses"
            >
              <ChevronLeft className="w-6 h-6" />
            </Button>
            <div>
              <h3 className="text-xl font-bold text-white leading-none mb-1">
                {selectedCourse.name}
              </h3>
              <p className="text-xs text-slate-500">
                {selectedCourse.category} / {selectedCourse.subCategory} /{" "}
                {selectedCourse.subSubCategory}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 pr-4">
            <div className="hidden md:block w-32 h-2 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 transition-all duration-500"
                style={{ width: `${progress[selectedCourse.id] || 0}%` }}
              />
            </div>
            <span className="text-xs font-mono text-slate-400 w-8 text-right">
              {Math.round(progress[selectedCourse.id] || 0)}%
            </span>
          </div>
        </div>

        <ScrollArea
          className="flex-1 pr-4"
          onScrollCapture={(e: any) => {
            const target = e.currentTarget;
            if (target) {
              const scrollPercent =
                (target.scrollTop /
                  (target.scrollHeight - target.clientHeight)) *
                100;
              saveProgress(selectedCourse.id, scrollPercent);
            }
          }}
        >
          <div className="max-w-3xl mx-auto space-y-12 pb-32 pt-8">
            {selectedCourse.sections.map((section) => (
              <section key={section.id} className="space-y-6">
                <div className="space-y-2">
                  <h4 className="text-3xl font-bold text-white tracking-tight">
                    {section.title}
                  </h4>
                  <div className="h-1 w-20 bg-cyan-500 rounded-full" />
                </div>
                <p className="text-slate-300 leading-relaxed text-lg">
                  {section.content}
                </p>

                {section.subsections?.map((sub) => (
                  <div
                    key={sub.id}
                    className="bg-slate-900/40 rounded-2xl p-8 border border-slate-800/50 space-y-6 hover:bg-slate-900/60 transition-colors"
                  >
                    <h5 className="text-2xl font-semibold text-white flex items-center gap-3">
                      {sub.model === "cpu" && (
                        <Cpu className="w-6 h-6 text-cyan-500" />
                      )}
                      {sub.model === "ram" && (
                        <Box className="w-6 h-6 text-cyan-500" />
                      )}
                      {sub.model === "motherboard" && (
                        <Layers className="w-6 h-6 text-cyan-500" />
                      )}
                      {!sub.model && (
                        <div className="w-2 h-2 rounded-full bg-cyan-500" />
                      )}
                      {sub.title}
                    </h5>

                    <p className="text-slate-400 leading-relaxed">
                      {sub.content}
                    </p>

                    {sub.model && <ModelViewer type={sub.model} />}
                  </div>
                ))}
              </section>
            ))}

            <div className="pt-12 border-t border-slate-900 flex flex-col items-center gap-6">
              <div className="w-20 h-20 rounded-full bg-green-500/10 flex items-center justify-center ring-1 ring-green-500/20">
                <BookOpen className="w-10 h-10 text-green-400" />
              </div>
              <div className="text-center">
                <h5 className="text-2xl font-bold text-white mb-2">
                  Congratulations!
                </h5>
                <p className="text-slate-400">
                  You have completed the &quot;{selectedCourse.name}&quot;
                  course.
                </p>
              </div>
              <Button
                size="lg"
                className="bg-cyan-600 hover:bg-cyan-500 text-white px-8"
                onClick={() => setView("home")}
              >
                Return to Library
              </Button>
            </div>
          </div>
        </ScrollArea>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full text-slate-200">
      <div className="flex-1 overflow-hidden">
        {view === "home" && renderHome()}
        {view === "category" && renderCategoryBrowser()}
        {view === "course" && renderCourseViewer()}
      </div>
    </div>
  );
}
