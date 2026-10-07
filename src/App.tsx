import { useMemo, useRef, useState } from 'react';
import WagonSelector from './components/WagonSelector';
import SearchParamsForm from './components/SearchParamsForm';
import ResultPanel from './components/ResultPanel';
import SchemeDiagram from './components/SchemeDiagram';
import { search } from './utils/solver';
import { isCustomWagon, loadCustomWagons, saveCustomWagons } from './utils/customWagons';
import type { SearchParams, SearchResult, WagonType } from './utils/types';
import './App.css';

const DEFAULT_PARAMS: SearchParams = {
  sectionCount: 2,
  equalSections: true,
  sectionMin: 3000,
  sectionMax: 8000,
  sectionStep: 100,
  gapMin: 1000,
  gapMax: 7000,
  gapStep: 100,
  margin: 100,
  marginFloor: 50,
  totalMax: 25000,
};

function App() {
  // Свои вагоны восстанавливаются из хранилища, пресеты каждый раз заново
  const [wagons, setWagons] = useState<WagonType[]>(() => loadCustomWagons());
  const [params, setParams] = useState<SearchParams>(DEFAULT_PARAMS);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedWagonId, setSelectedWagonId] = useState<string>('');
  const [nextWagonId, setNextWagonId] = useState<string>('');
  const [shownResult, setShownResult] = useState<SearchResult | null>(null);
  const svgHostRef = useRef<HTMLDivElement>(null);

  const canCalculate = wagons.length > 0;

  /** Любое изменение состава сохраняет в файл только свои вагоны. */
  const updateWagons = (next: WagonType[]) => {
    setWagons(next);
    saveCustomWagons(next.filter(isCustomWagon));
  };

  const calculate = () => {
    if (!canCalculate) return;
    setBusy(true);
    setTimeout(() => {
      try {
        const res = search(wagons, params);
        setResult(res);
        setShownResult(res);
        if (!res.evaluation.wagonReports.some((r) => r.wagon.id === selectedWagonId)) {
          setSelectedWagonId(res.evaluation.wagonReports[0]?.wagon.id ?? '');
        }
        if (!wagons.some((w) => w.id === nextWagonId)) {
          setNextWagonId('');
        }
      } catch (err) {
        console.error('Подбор конфигурации не удался', err);
        setResult(null);
        setShownResult(null);
      } finally {
        setBusy(false);
      }
    }, 30);
  };

  const selectAlternative = (index: number) => {
    if (!result) return;
    const alt = result.alternatives[index];
    if (!alt) return;
    const geometryFeasible = alt.evaluation.currentFailures === 0 && alt.evaluation.nextFailures === 0;
    const status = alt.evaluation.ok
      ? 'ok'
      : geometryFeasible || alt.evaluation.minCurrentMargin >= params.marginFloor
        ? 'caution'
        : 'impossible';
    setShownResult({
      ...result,
      best: alt.candidate,
      evaluation: alt.evaluation,
      perfect: alt.evaluation.ok,
      status,
    });
  };

  const shown = shownResult ?? result;

  const selectedWagon: WagonType | null = useMemo(() => {
    if (!shown) return null;
    return shown.evaluation.wagonReports.find((r) => r.wagon.id === selectedWagonId)?.wagon ?? shown.evaluation.wagonReports[0]?.wagon ?? null;
  }, [shown, selectedWagonId]);

  /**
   * Сцепленный сосед, выбранный для показа на схеме. Если выбор сброшен или
   * совпадает с вагоном на платформе, берём первый отличный от него — иначе
   * схема рисовала бы вагон, сцепленный сам с собой, и проверка в
   * SchemeDiagram не нашла бы подходящую пару.
   */
  const nextWagon: WagonType | null = useMemo(() => {
    if (!selectedWagon) return wagons[0] ?? null;
    const chosen = wagons.find((w) => w.id === nextWagonId);
    if (chosen && chosen.id !== selectedWagon.id) return chosen;
    return wagons.find((w) => w.id !== selectedWagon.id) ?? selectedWagon;
  }, [nextWagonId, selectedWagon, wagons]);

  const downloadPng = () => {
    const svg = svgHostRef.current?.querySelector('svg');
    if (!svg || !selectedWagon) return;

    // Размеры берём из viewBox, а не из clientWidth: при max-w-full на
    // узком экране layout-ширина не совпадает с системой координат SVG.
    const vb = (svg as SVGSVGElement).viewBox.baseVal;
    const w = vb && vb.width ? vb.width : svg.clientWidth;
    const h = vb && vb.height ? vb.height : svg.clientHeight;
    if (!w || !h) return;

    // Подставляем явные размеры: иначе в img размеры не определены
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('width', String(w));
    clone.setAttribute('height', String(h));
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

    const xml = new XMLSerializer().serializeToString(clone);
    const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const scale = 2;
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob((png) => {
        if (!png) return;
        const a = document.createElement('a');
        const pngUrl = URL.createObjectURL(png);
        a.href = pngUrl;
        a.download = `platform-${selectedWagon.name}.png`;
        a.click();
        URL.revokeObjectURL(pngUrl);
      });
    };
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
  };

  return (
    <div className="min-h-screen bg-gray-50 py-4">
      <div className="container mx-auto px-4 max-w-7xl">
        <header className="mb-4">
          <h1 className="text-xl font-bold text-gray-800">Конфигуратор весовой платформы</h1>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-1 space-y-4">
            <div className="bg-white p-4 rounded-lg shadow">
              <WagonSelector selected={wagons} onChange={updateWagons} />
            </div>
            <div className="bg-white p-4 rounded-lg shadow">
              <SearchParamsForm params={params} onChange={setParams} onCalculate={calculate} busy={busy} />
              {!canCalculate && (
                <p className="text-xs text-gray-400 mt-2">Отметьте хотя бы один тип вагона.</p>
              )}
            </div>
          </div>

          <div className="lg:col-span-2 space-y-4">
            {shown ? (
              <>
                {selectedWagon && nextWagon && shown.evaluation.sections.length > 0 && (
                  <div className="bg-white p-4 rounded-lg shadow">
                    <div ref={svgHostRef} className="overflow-x-auto">
                      <SchemeDiagram
                        evaluation={shown.evaluation}
                        wagon={selectedWagon}
                        nextWagon={nextWagon}
                        margin={params.margin}
                        width={1100}
                      />
                    </div>
                  </div>
                )}
                <div className="bg-white p-4 rounded-lg shadow">
                  <ResultPanel
                    result={shown}
                    margin={params.margin}
                    selectedWagonId={selectedWagonId}
                    onSelectWagon={setSelectedWagonId}
                    nextWagonId={nextWagon?.id ?? ''}
                    onSelectNextWagon={setNextWagonId}
                    onSelectAlternative={selectAlternative}
                    onDownloadPng={downloadPng}
                  />
                </div>
              </>
            ) : (
              <div className="bg-white p-5 rounded-lg shadow h-full flex items-center justify-center">
                <p className="text-gray-500 text-center max-w-md text-sm">
                  Отметьте вагоны, задайте параметры и нажмите «Подобрать конфигурацию».
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
