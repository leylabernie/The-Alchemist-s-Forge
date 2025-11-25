import React, { useState, useCallback } from 'react';
import type { ProductConcept, ListingCopy, AppStep, DesignStyle, ProductType } from './types';
import { generateIdeationPackage, generateDesign, generateFinalAssets } from './services/geminiService';
import { getPrintifyShop, uploadImageToPrintify, createPrintifyProduct } from './services/printifyService';
import { SparklesIcon, DownloadIcon, ArrowLeftIcon, SettingsIcon } from './components/icons';

declare const JSZip: any;

interface FinalizedProduct {
    concept: ProductConcept;
    designUrl: string;
    mockups: string[];
    listingCopy: ListingCopy;
    productType: ProductType;
    printifyId?: string;
}

interface DesignItem {
    concept: ProductConcept;
    url: string;
    productType: ProductType;
}


const App: React.FC = () => {
    const [step, setStep] = useState<AppStep>('CONFIG');
    const [isLoading, setIsLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [showSettings, setShowSettings] = useState(false);

    // Config State
    const [holiday, setHoliday] = useState<string>('Christmas');
    const [style, setStyle] = useState<DesignStyle>('Minimalist Vector');
    const [productType, setProductType] = useState<ProductType>('Sweatshirt');
    const [printifyToken, setPrintifyToken] = useState<string>('');

    // Ideation State
    const [variations, setVariations] = useState<ProductConcept[]>([]);
    const [selectedVariations, setSelectedVariations] = useState<ProductConcept[]>([]);
    
    // Design State
    const [generatedDesigns, setGeneratedDesigns] = useState<Record<string, string>>({}); // Key is conceptTitle, value is image URL
    const [selectedDesigns, setSelectedDesigns] = useState<DesignItem[]>([]);

    // Finalize State
    const [finalizedProducts, setFinalizedProducts] = useState<FinalizedProduct[]>([]);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);


    const handleApiError = (error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        setError(message);
        setIsLoading(false);
    };

    const handleForgeConcepts = async () => {
        setIsLoading(true);
        setLoadingMessage('Fusing your selections into new concepts...');
        setError(null);
        try {
            const concepts = await generateIdeationPackage(holiday, style, productType);
            setVariations(concepts);
            setSelectedVariations([]);
            setStep('IDEATION');
        } catch (e) {
            handleApiError(e);
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleToggleVariationSelection = (concept: ProductConcept) => {
        setSelectedVariations(prev =>
            prev.some(c => c.conceptTitle === concept.conceptTitle)
                ? prev.filter(c => c.conceptTitle !== concept.conceptTitle)
                : [...prev, concept]
        );
    };

    const handleForgeDesigns = async () => {
        if (selectedVariations.length === 0) return;
        setIsLoading(true);
        setLoadingMessage(`Forging ${selectedVariations.length} design(s)...`);
        setError(null);
        setGeneratedDesigns({});
        setSelectedDesigns([]);

        try {
            const newDesigns: Record<string, string> = {};
            for (let i = 0; i < selectedVariations.length; i++) {
                const concept = selectedVariations[i];
                setLoadingMessage(`Forging design ${i + 1} of ${selectedVariations.length}: "${concept.conceptTitle}"`);
                const url = await generateDesign(concept, style);
                newDesigns[concept.conceptTitle] = url;

                // Add a small delay between design generations to avoid hitting API rate limits.
                if (i < selectedVariations.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 1500));
                }
            }

            setGeneratedDesigns(newDesigns);
            setStep('DESIGN');
        } catch (e) {
            handleApiError(e);
        } finally {
            setIsLoading(false);
        }
    };

    const handleToggleDesignSelection = (concept: ProductConcept, url: string) => {
        setSelectedDesigns(prev =>
            prev.some(d => d.url === url)
                ? prev.filter(d => d.url !== url)
                : [...prev, { concept, url, productType }]
        );
    };
    
    const handleProductTypeChangeForDesign = (url: string, newProductType: ProductType) => {
        setSelectedDesigns(prev =>
            prev.map(design =>
                design.url === url ? { ...design, productType: newProductType } : design
            )
        );
    };

    const handleForgeAssets = async (singleDesign?: DesignItem) => {
        const designsToProcess = singleDesign ? [singleDesign] : selectedDesigns;

        if (designsToProcess.length === 0) return;
        setIsLoading(true);
        setError(null);
        setFinalizedProducts([]); // Start fresh for this batch
        
        const allFinalAssets: FinalizedProduct[] = [];

        try {
            for (let i = 0; i < designsToProcess.length; i++) {
                const design = designsToProcess[i];
                const overallProgress = `Processing Design ${i + 1} of ${designsToProcess.length}: "${design.concept.conceptTitle}"`;
                setLoadingMessage(overallProgress);

                const { mockups: finalMockups, listingCopy: finalCopy } = await generateFinalAssets(
                    design.url,
                    design.concept,
                    holiday,
                    design.productType,
                    (progress, total) => {
                        const stage = progress <= 1 ? "Writing compelling copy..." : `Generating mockup ${progress - 1}/${total - 1}...`;
                        setLoadingMessage(`${overallProgress}\n${stage}`);
                    }
                );
                
                allFinalAssets.push({
                    concept: design.concept,
                    designUrl: design.url,
                    mockups: finalMockups,
                    listingCopy: finalCopy,
                    productType: design.productType
                });
            }
            
            setFinalizedProducts(allFinalAssets);
            setStep('FINALIZE');

        } catch(e) {
            handleApiError(e);
        } finally {
            setIsLoading(false);
        }
    };

    const handlePrintifyPublish = async (product: FinalizedProduct) => {
        if (!printifyToken) {
            setShowSettings(true);
            return;
        }

        setIsLoading(true);
        setLoadingMessage("Connecting to Printify...");
        setError(null);
        setSuccessMessage(null);

        try {
            // 1. Get Shop
            const shop = await getPrintifyShop(printifyToken);
            
            // 2. Upload Image
            setLoadingMessage("Uploading design to Printify Media Library...");
            const filename = `${product.concept.conceptTitle.replace(/[^a-z0-9]/gi, '_')}.png`;
            const imageId = await uploadImageToPrintify(printifyToken, product.designUrl, filename);

            // 3. Create Product
            setLoadingMessage(`Creating ${product.productType} listing...`);
            const printifyProduct = await createPrintifyProduct(
                printifyToken,
                shop.id,
                product.productType,
                imageId,
                product.listingCopy
            );

            setSuccessMessage(`Successfully created "${printifyProduct.title}" in Printify!`);
            
            // Update local state to show it's published
            setFinalizedProducts(prev => prev.map(p => 
                p.concept.conceptTitle === product.concept.conceptTitle 
                ? { ...p, printifyId: printifyProduct.id } 
                : p
            ));

        } catch (e) {
            handleApiError(e);
        } finally {
            setIsLoading(false);
        }
    };

    const generateZip = useCallback(async (products: FinalizedProduct[]) => {
      if (products.length === 0) {
          setError("Missing assets to generate a package.");
          return;
      }
      setIsLoading(true);
      setLoadingMessage(products.length === 1 ? "Packaging single asset..." : "Packaging your launch kit...");
      try {
          const zip = new JSZip();
          
          for (const product of products) {
              const safeTitle = product.concept.conceptTitle.replace(/[^a-zA-Z0-9]/g, '-');
              // If downloading single, put files in root. If multiple, use folders.
              const folder = products.length === 1 ? zip : zip.folder(safeTitle);

              const copyContent = `Title:\n${product.listingCopy.title}\n\nDescription:\n${product.listingCopy.description}\n\nVariations:\n${(product.listingCopy.variations || []).join('\n')}\n\nTags:\n${(product.listingCopy.tags || []).join(', ')}`;
              folder!.file("listing_copy.txt", copyContent);

              const designData = product.designUrl.split('base64,')[1];
              folder!.file("design.png", designData, { base64: true });
              
              const mockupsFolder = folder!.folder("Mockups");
              for(let i = 0; i < product.mockups.length; i++) {
                const mockupData = product.mockups[i].split('base64,')[1];
                mockupsFolder!.file(`mockup_${i + 1}.jpg`, mockupData, { base64: true });
              }
          }

          const content = await zip.generateAsync({ type: "blob" });
          const link = document.createElement("a");
          link.href = URL.createObjectURL(content);
          
          let filename = `Alchemist-Forge-Launch-Pack.zip`;
          if (products.length === 1) {
              filename = `${products[0].concept.conceptTitle.replace(/[^a-zA-Z0-9]/g, '-')}-Assets.zip`;
          }
          
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
      } catch (e) {
          setError(e instanceof Error ? e.message : "Failed to create zip file.");
      } finally {
          setIsLoading(false);
      }
    }, []);
    
    const resetProcess = () => {
        setStep('CONFIG');
        setVariations([]);
        setSelectedVariations([]);
        setGeneratedDesigns({});
        setSelectedDesigns([]);
        setFinalizedProducts([]);
        setError(null);
        setSuccessMessage(null);
        setIsLoading(false);
    };

    const renderHeader = () => (
        <div className="flex items-center justify-between p-6 bg-gray-900 border-b border-gray-700 relative">
             <div className="w-8"></div> {/* Spacer to balance the layout */}
            <div className="text-center">
                <h1 className="text-3xl md:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-amber-400">
                    The Alchemist's Forge
                </h1>
                <p className="text-gray-400 mt-2 hidden md:block">Your Personal Ideation & Creation Engine</p>
            </div>
            <button 
                onClick={() => setShowSettings(true)} 
                className="text-gray-400 hover:text-white p-2 transition-colors rounded-full hover:bg-gray-800"
                title="Settings & API Keys"
            >
                <SettingsIcon className="w-6 h-6" />
            </button>
        </div>
    );
    
    const renderLoader = () => (
        <div className="flex flex-col items-center justify-center text-center p-8">
            <svg className="animate-spin h-12 w-12 text-purple-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <p className="mt-4 text-lg text-amber-300 font-semibold whitespace-pre-line">{loadingMessage}</p>
        </div>
    );

    const renderSettingsModal = () => {
        if (!showSettings) return null;
        return (
            <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm" onClick={() => setShowSettings(false)}>
                <div className="bg-gray-800 border border-gray-700 p-8 rounded-2xl max-w-md w-full shadow-2xl relative" onClick={e => e.stopPropagation()}>
                    <div className="flex justify-between items-center mb-6 border-b border-gray-700 pb-4">
                        <h3 className="text-xl font-bold text-white">Settings</h3>
                        <button onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-white transition-colors">
                            <span className="text-2xl">&times;</span>
                        </button>
                    </div>
                    <div className="space-y-6">
                        <div>
                             <label className="block text-sm font-semibold text-green-400 mb-2">
                                Printify API Token
                             </label>
                             <input 
                                type="password"
                                value={printifyToken}
                                onChange={(e) => setPrintifyToken(e.target.value)}
                                placeholder="Paste token here..."
                                className="w-full bg-gray-900 text-white border border-gray-600 rounded-lg px-4 py-3 focus:ring-green-500 focus:border-green-500 text-sm transition-all"
                             />
                             <p className="text-xs text-gray-500 mt-2">
                                Required to publish listings. Find this in your Printify Account &gt; Connections &gt; Tokens.
                             </p>
                        </div>
                    </div>
                    <div className="mt-8 flex justify-end">
                        <button 
                            onClick={() => setShowSettings(false)}
                            className="bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2 px-6 rounded-lg transition-colors shadow-lg shadow-purple-900/20"
                        >
                            Save & Close
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    const HOLIDAYS = ['Christmas', 'Halloween', 'Thanksgiving', 'Valentine\'s Day', 'Easter', 'Mother\'s Day'];
    const DESIGN_STYLES: DesignStyle[] = ['Minimalist Vector', 'Geometric Modern', 'Retro Script', 'Vintage Engraving', 'Watercolor Botanical', 'Cosmic Doodle', 'Art Deco', 'Cyberpunk Glitch'];
    const PRODUCT_TYPES: ProductType[] = ['Sweatshirt', 'Hoodie', 'Mug', 'Ornament', 'T-Shirt', 'Tote Bag', 'Pillow'];

    const renderConfig = () => (
        <div className="w-full max-w-4xl mx-auto flex flex-col items-center">
            <h2 className="text-2xl font-bold text-amber-300 mb-2 text-center">Step 1: Define Your Creation</h2>
            <p className="text-gray-400 mb-8 text-center">Choose the core elements. The Alchemist will handle the rest.</p>

            <div className="w-full space-y-8">
                <ConfigSection title="Holiday Theme" items={HOLIDAYS} selected={holiday} onSelect={setHoliday} />
                <ConfigSection title="Design Style" items={DESIGN_STYLES} selected={style} onSelect={setStyle as (s: string) => void} />
                <ConfigSection title="Product Type" items={PRODUCT_TYPES} selected={productType} onSelect={setProductType as (s: string) => void} />
                
                <div className="max-w-md mx-auto pt-4 border-t border-gray-700 w-full text-center">
                    <button 
                        onClick={() => setShowSettings(true)}
                        className="text-green-400 hover:text-green-300 text-sm font-semibold flex items-center justify-center gap-2 mx-auto transition-colors"
                    >
                        <SettingsIcon className="w-4 h-4" />
                        Configure Printify API Token
                    </button>
                    <p className="text-xs text-gray-500 mt-1">Optional. Only needed for one-click publishing.</p>
                </div>
            </div>

            <button
                onClick={handleForgeConcepts}
                className="mt-12 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold py-4 px-8 rounded-lg flex items-center gap-2 transition-transform transform hover:scale-105 text-lg"
            >
                <SparklesIcon className="w-6 h-6" />
                Forge 3 Concept Variations
            </button>
        </div>
    );

    const ConfigSection = ({ title, items, selected, onSelect }: { title: string; items: string[]; selected: string; onSelect: (item: string) => void }) => (
        <div>
            <h3 className="text-lg font-semibold text-purple-300 mb-4 text-center">{title}</h3>
            <div className="flex flex-wrap justify-center gap-3">
                {items.map(item => (
                    <button
                        key={item}
                        onClick={() => onSelect(item)}
                        className={`bg-gray-700/50 text-gray-300 py-2 px-4 rounded-full text-sm hover:bg-purple-800/40 hover:border-purple-600 hover:text-white transition-all transform hover:scale-105 ${
                            selected === item
                            ? 'border-purple-500 ring-2 ring-purple-500 bg-purple-900/50 text-white'
                            : 'border border-gray-600'
                        }`}
                    >
                        {item}
                    </button>
                ))}
            </div>
        </div>
    );

    const renderIdeation = () => (
        <div className="w-full max-w-5xl mx-auto flex flex-col items-center">
            <h2 className="text-2xl font-bold text-amber-300 mb-2">Step 2: Select Your Variations</h2>
            <p className="text-gray-400 mb-8">Choose one or more concepts to generate designs for.</p>
            <div className="w-full grid md:grid-cols-3 gap-6">
                {variations.map((concept, index) => (
                    <label key={index} className="bg-gray-800 border-2 border-gray-700 rounded-xl p-5 transition-all cursor-pointer has-[:checked]:border-purple-500 has-[:checked]:ring-2 has-[:checked]:ring-purple-500">
                        <div className="flex items-start gap-4">
                            <input type="checkbox"
                                checked={selectedVariations.some(c => c.conceptTitle === concept.conceptTitle)}
                                onChange={() => handleToggleVariationSelection(concept)}
                                className="mt-1 h-5 w-5 rounded border-gray-500 bg-gray-900/50 text-purple-600 focus:ring-purple-500 focus:ring-offset-0 flex-shrink-0"
                            />
                            <div>
                                <h3 className="font-bold text-lg text-amber-400">{concept.conceptTitle}</h3>
                                <p className="text-xs text-purple-400 mt-1 mb-2">
                                    <span className="font-semibold">Fusion:</span> {concept.fusion.join(' + ')}
                                </p>
                                <p className="text-gray-300 mb-3 text-sm">{concept.vision}</p>
                            </div>
                        </div>
                    </label>
                ))}
            </div>
             <button
                onClick={handleForgeDesigns}
                disabled={selectedVariations.length === 0}
                className="mt-10 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold py-3 px-6 rounded-lg flex items-center gap-2 transition-transform transform hover:scale-105 disabled:opacity-50 disabled:scale-100"
            >
                <SparklesIcon className="w-5 h-5" />
                Forge {selectedVariations.length} {selectedVariations.length === 1 ? 'Design' : 'Designs'}
            </button>
        </div>
    );

    const renderDesign = () => (
        <div className="w-full max-w-6xl mx-auto flex flex-col items-center">
            <h2 className="text-2xl font-bold text-amber-300 mb-2">Step 3: Choose Your Final Design(s)</h2>
            <p className="text-gray-400 mb-8">Select designs to process in bulk, or generate assets individually.</p>
            <div className="w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {variations.filter(v => generatedDesigns[v.conceptTitle]).map(concept => {
                    const url = generatedDesigns[concept.conceptTitle];
                    const isSelected = selectedDesigns.some(d => d.url === url);
                    const currentProductType = selectedDesigns.find(d => d.url === url)?.productType || productType;

                    return (
                        <div key={concept.conceptTitle} className="bg-gray-800/40 rounded-xl p-4 border border-transparent flex flex-col">
                             <h3 className="font-semibold text-amber-400 mb-2 text-center truncate" title={concept.conceptTitle}>"{concept.conceptTitle}"</h3>
                             <label className={`relative block bg-gray-800 border-2 border-gray-700 rounded-xl p-2 transition-all cursor-pointer ${isSelected ? 'border-purple-500 ring-2 ring-purple-500' : ''}`}>
                                <input type="checkbox"
                                       checked={isSelected}
                                       onChange={() => handleToggleDesignSelection(concept, url)}
                                       className="absolute top-3 left-3 h-6 w-6 rounded-md border-gray-500 bg-gray-900/50 text-purple-600 focus:ring-purple-500 focus:ring-offset-0 z-10"
                                />
                                <div className="aspect-square flex items-center justify-center rounded-lg overflow-hidden" 
                                     style={{ backgroundImage: 'url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAC1JREFUOE9jZGBgEGHAD97/p038/w8f/v8ZPigew8+fP/8/f/78/w8f/g8A7pkBFCj/PcoAAAAASUVORK5CYII=")', backgroundRepeat: 'repeat' }}>
                                    <img src={url} alt={`Design for ${concept.conceptTitle}`} className="max-w-full max-h-full object-contain" />
                                </div>
                            </label>
                            
                            <div className="mt-3 space-y-3">
                                <div>
                                    <label htmlFor={`product-type-${concept.conceptTitle}`} className="block text-sm font-medium text-gray-400 mb-1 text-center">Product Type</label>
                                    <select
                                        id={`product-type-${concept.conceptTitle}`}
                                        value={currentProductType}
                                        onChange={(e) => handleProductTypeChangeForDesign(url, e.target.value as ProductType)}
                                        className="w-full bg-gray-700 text-white border border-gray-600 rounded-md px-2 py-1.5 text-sm focus:ring-purple-500 focus:border-purple-500"
                                    >
                                        {PRODUCT_TYPES.map(pt => <option key={pt} value={pt}>{pt}</option>)}
                                    </select>
                                </div>
                                <button
                                    onClick={() => handleForgeAssets({ concept, url, productType: currentProductType })}
                                    className="w-full bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 border border-indigo-500/50 font-semibold py-2 px-4 rounded-lg text-sm flex items-center justify-center gap-2 transition-colors"
                                >
                                    <SparklesIcon className="w-4 h-4" />
                                    Generate Assets
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
             <button
                onClick={() => handleForgeAssets()}
                disabled={selectedDesigns.length === 0}
                className="mt-12 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold py-3 px-6 rounded-lg flex items-center gap-2 transition-transform transform hover:scale-105 disabled:opacity-50 disabled:scale-100"
            >
                <SparklesIcon className="w-5 h-5" />
                Generate Assets for {selectedDesigns.length} Selected {selectedDesigns.length === 1 ? 'Design' : 'Designs'}
            </button>
        </div>
    );
    
    const renderFinalize = () => (
        <div className="w-full max-w-7xl mx-auto flex flex-col items-center">
             <div className="flex items-center justify-between w-full max-w-5xl mb-6">
                <button 
                    onClick={() => setStep('DESIGN')}
                    className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
                >
                    <ArrowLeftIcon className="w-5 h-5" />
                    Back to Designs
                </button>
                <h2 className="text-3xl font-bold text-amber-300 text-center flex-1">Your Creations are Forged!</h2>
                <div className="w-24"></div> {/* Spacer for centering */}
             </div>
             
             <p className="text-gray-400 mb-8 text-center">All assets for your generated design(s) are ready.</p>
             
             {successMessage && (
                <div className="mb-6 bg-green-900/50 border border-green-500 text-green-300 px-6 py-4 rounded-lg w-full max-w-3xl text-center">
                    {successMessage}
                </div>
             )}

            <div className="w-full space-y-12">
                {finalizedProducts.map((product, idx) => (
                    <div key={idx} className="bg-gray-800/50 border border-gray-700 rounded-2xl p-6 relative">
                        <div className="flex flex-col md:flex-row items-center justify-between mb-6 gap-4">
                             <div className="text-center md:text-left">
                                <h3 className="text-2xl font-bold text-amber-400">"{product.concept.conceptTitle}"</h3>
                                <p className="text-purple-300 font-semibold mt-1">{product.productType}</p>
                            </div>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => handlePrintifyPublish(product)}
                                    disabled={!!product.printifyId}
                                    className={`text-white font-semibold py-2 px-4 rounded-lg flex items-center gap-2 text-sm border transition-colors ${
                                        product.printifyId 
                                        ? 'bg-green-900/50 border-green-600 text-green-400 cursor-default' 
                                        : 'bg-green-600 hover:bg-green-700 border-green-500'
                                    }`}
                                >
                                    {product.printifyId ? 'Published' : 'Send to Printify'}
                                </button>
                                <button
                                    onClick={() => generateZip([product])}
                                    className="bg-gray-700 hover:bg-gray-600 text-white font-semibold py-2 px-4 rounded-lg flex items-center gap-2 text-sm border border-gray-600 transition-colors"
                                >
                                    <DownloadIcon className="w-4 h-4" />
                                    Download Package
                                </button>
                            </div>
                        </div>
                        
                        <div className="grid lg:grid-cols-5 gap-8">
                            <div className="lg:col-span-2 space-y-6">
                                <div>
                                    <h4 className="text-xl font-bold text-purple-400 mb-3">Final Design</h4>
                                    <div className="bg-gray-800 p-2 rounded-xl border border-gray-700" style={{ backgroundImage: 'url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAC1JREFUOE9jZGBgEGHAD97/p038/w8f/v8ZPigew8+fP/8/f/78/w8f/g8A7pkBFCj/PcoAAAAASUVORK5CYII=")', backgroundRepeat: 'repeat' }}>
                                        <img src={product.designUrl} alt="Final Design" className="rounded-lg w-full object-contain" />
                                    </div>
                                </div>
                                <div>
                                    <h4 className="text-xl font-bold text-purple-400 mb-3">Listing Copy</h4>
                                    <div className="bg-gray-800 p-4 rounded-xl border border-gray-700 space-y-4 text-sm">
                                        <CopyBlock title="Title" content={product.listingCopy?.title} />
                                        <CopyBlock title="Description" content={product.listingCopy?.description} isTextArea={true} />
                                        <CopyBlock title="Variations" content={product.listingCopy?.variations?.join(', ')} />
                                        <CopyBlock title="Tags (13)" content={product.listingCopy?.tags?.join(', ')} />
                                    </div>
                                </div>
                            </div>
                            <div className="lg:col-span-3">
                                <h4 className="text-xl font-bold text-purple-400 mb-3">Product Mockups ({product.mockups.length})</h4>
                                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4 bg-gray-800 p-4 rounded-xl border border-gray-700">
                                    {product.mockups.map((url, index) => (
                                        <img key={index} src={url} alt={`Mockup ${index + 1}`} className="rounded-md aspect-square object-cover w-full h-full" />
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <div className="mt-12 flex flex-col items-center gap-6">
                <button
                    onClick={() => generateZip(finalizedProducts)}
                    className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-gray-900 font-bold py-4 px-8 rounded-lg flex items-center gap-3 transition-transform transform hover:scale-105 text-lg"
                >
                    <DownloadIcon className="w-6 h-6" />
                    Download Full Launch Pack (.zip)
                </button>
                 <button onClick={resetProcess} className="text-gray-400 hover:text-amber-300">
                    + Forge Another Creation
                 </button>
            </div>
        </div>
    );
    
    const CopyBlock = ({ title, content, isTextArea = false }: { title: string; content?: string; isTextArea?: boolean }) => {
        const [copied, setCopied] = useState(false);
        const handleCopy = () => {
            if (content) {
                navigator.clipboard.writeText(content);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            }
        };

        const DisplayComponent = isTextArea ? 'textarea' : 'input';

        return (
            <div>
                <div className="flex justify-between items-center mb-1">
                    <label className="font-semibold text-gray-300">{title}</label>
                    <button onClick={handleCopy} className="text-xs text-amber-300 hover:text-amber-200">{copied ? 'Copied!' : 'Copy'}</button>
                </div>
                <DisplayComponent
                    readOnly
                    value={content || ''}
                    className="w-full bg-gray-700/50 text-gray-300 border border-gray-600 rounded-md px-2 py-1 text-xs"
                    rows={isTextArea ? 5 : undefined}
                />
            </div>
        );
    };

    const renderContent = () => {
        if (isLoading) return renderLoader();

        switch (step) {
            case 'FINALIZE': return renderFinalize();
            case 'DESIGN': return renderDesign();
            case 'IDEATION': return renderIdeation();
            case 'CONFIG':
            default:
                return renderConfig();
        }
    };

    return (
        <div className="bg-gray-900 text-white min-h-screen font-sans">
            {renderHeader()}
            <main className="container mx-auto px-4 py-10">
                {error && (
                    <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-lg mb-6 max-w-3xl mx-auto text-center" role="alert">
                        <strong className="font-bold">An error occurred: </strong>
                        <span className="block sm:inline">{error}</span>
                    </div>
                )}
                {renderContent()}
                {renderSettingsModal()}
            </main>
        </div>
    );
};

export default App;