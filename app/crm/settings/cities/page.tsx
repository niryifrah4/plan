"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useConfirm } from "@/components/ui/ConfirmModal";

type City = {
  id: string;
  name: string;
  english_name: string | null;
  symbol_code: number | null;
};

// Helper function to fix inverted parentheses in RTL context
const fixParentheses = (text: string) => {
  return text.replace(/[()]/g, (match) => (match === '(' ? ')' : '('));
};

const PAGE_SIZE = 50;

export default function CitiesSettingsPage() {
  const [cities, setCities] = useState<City[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [newCityName, setNewCityName] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  
  const supabase = createClient();
  const { confirm, modal } = useConfirm();

  const fetchCities = async () => {
    setLoading(true);
    let allData: City[] = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from("israel_cities")
        .select("*")
        .order("name")
        .range(page * pageSize, (page + 1) * pageSize - 1);
        
      if (error) {
        console.error("Error fetching cities", error);
        break;
      }
      
      if (data) {
        allData = [...allData, ...data];
        if (data.length < pageSize) {
          hasMore = false;
        } else {
          page++;
        }
      } else {
        hasMore = false;
      }
    }
    
    setCities(allData);
    setLoading(false);
  };

  useEffect(() => {
    fetchCities();
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCityName.trim()) return;
    
    const { error } = await supabase
      .from("israel_cities")
      .insert({ name: newCityName.trim() });
      
    if (error) {
      alert("שגיאה בהוספת עיר: " + error.message);
    } else {
      setNewCityName("");
      setIsAdding(false);
      fetchCities();
    }
  };

  const handleDelete = async (city: City) => {
    const ok = await confirm({
      title: "מחיקת עיר",
      body: `האם אתה בטוח שברצונך למחוק את העיר "${fixParentheses(city.name)}"?`,
      variant: "danger",
      confirmLabel: "מחק",
      cancelLabel: "ביטול",
    });
    if (!ok) return;

    const { error } = await supabase
      .from("israel_cities")
      .delete()
      .eq("id", city.id);
      
    if (error) {
      alert("שגיאה במחיקת עיר: " + error.message);
    } else {
      const next = new Set(selectedIds);
      next.delete(city.id);
      setSelectedIds(next);
      fetchCities();
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    const ok = await confirm({
      title: "מחיקת ערים מרובות",
      body: `האם אתה בטוח שברצונך למחוק ${selectedIds.size} ערים שנבחרו?`,
      variant: "danger",
      confirmLabel: "מחק הכל",
      cancelLabel: "ביטול",
    });
    if (!ok) return;

    const { error } = await supabase
      .from("israel_cities")
      .delete()
      .in("id", Array.from(selectedIds));
      
    if (error) {
      alert("שגיאה במחיקת ערים: " + error.message);
    } else {
      setSelectedIds(new Set());
      fetchCities();
    }
  };

  const filteredCities = useMemo(() => {
    return cities.filter((c) =>
      c.name.toLowerCase().includes(search.toLowerCase())
    );
  }, [cities, search]);

  // Reset page to 1 when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [search]);

  const totalPages = Math.max(1, Math.ceil(filteredCities.length / PAGE_SIZE));
  const paginatedCities = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredCities.slice(start, start + PAGE_SIZE);
  }, [filteredCities, currentPage]);

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  // Select/Deselect all ON CURRENT PAGE
  const toggleSelectAll = () => {
    if (paginatedCities.length === 0) return;
    const allCurrentPageSelected = paginatedCities.every((c) => selectedIds.has(c.id));
    
    const next = new Set(selectedIds);
    if (allCurrentPageSelected) {
      // deselect current page
      paginatedCities.forEach((c) => next.delete(c.id));
    } else {
      // select current page
      paginatedCities.forEach((c) => next.add(c.id));
    }
    setSelectedIds(next);
  };

  const isAllCurrentPageSelected = paginatedCities.length > 0 && paginatedCities.every(c => selectedIds.has(c.id));

  return (
    <main
      dir="rtl"
      className="relative min-h-screen px-6 py-8"
      style={{ background: "var(--verdant-bg)" }}
    >
      {modal}
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-verdant-ink">ניהול ערים</h1>
            <p className="text-sm text-verdant-muted mt-1">הוספה, מחיקה וניהול רשימת הערים בישראל להשלמה אוטומטית.</p>
          </div>
          <Link
            href="/crm/settings"
            className="flex h-9 w-9 items-center justify-center rounded-xl text-verdant-muted transition-all hover:bg-gray-100 hover:text-verdant-ink"
            style={{ background: "#FAFAF7" }}
            title="חזרה להגדרות"
          >
            <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
          </Link>
        </div>

        <section className="card-pad flex flex-col relative">
          <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full max-w-xs">
              <span className="material-symbols-outlined pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[16px] text-verdant-muted">
                search
              </span>
              <input
                type="text"
                placeholder="חיפוש עיר..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="inp !py-1.5 !pr-10 text-sm w-full"
              />
            </div>
            
            <div className="flex items-center gap-2">
              {selectedIds.size > 0 && (
                <button
                  onClick={handleDeleteSelected}
                  className="btn-danger flex items-center gap-1.5 px-4 py-1.5 text-sm bg-red-50 text-red-600 hover:bg-red-100 rounded-lg font-bold transition-colors"
                >
                  <span className="material-symbols-outlined text-[16px]">delete</span>
                  מחק {selectedIds.size} נבחרים
                </button>
              )}
              
              {!isAdding ? (
                <button
                  onClick={() => setIsAdding(true)}
                  className="btn-botanical flex items-center gap-1.5 px-4 py-1.5 text-sm"
                >
                  <span className="material-symbols-outlined text-[16px]">add</span>
                  הוסף עיר
                </button>
              ) : (
                <form onSubmit={handleAdd} className="flex gap-2 w-full sm:w-auto">
                  <input
                    type="text"
                    placeholder="שם העיר..."
                    value={newCityName}
                    onChange={(e) => setNewCityName(e.target.value)}
                    className="inp !py-1.5 text-sm flex-1 sm:w-48"
                    autoFocus
                  />
                  <button type="submit" className="btn-botanical px-4 py-1.5 text-sm">
                    שמור
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsAdding(false)}
                    className="rounded-md bg-gray-100 px-4 py-1.5 text-sm font-bold text-gray-700 transition-colors hover:bg-gray-200"
                  >
                    ביטול
                  </button>
                </form>
              )}
            </div>
          </div>

          <div className="mt-6 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm flex flex-col">
            <div className="flex-1 overflow-y-auto min-h-[300px]">
              {loading ? (
                <div className="p-8 text-center text-sm text-verdant-muted">טוען נתונים...</div>
              ) : (
                <table className="w-full text-right text-sm">
                  <thead className="bg-[#FAFAF7] text-verdant-muted sticky top-0 border-b border-gray-100 z-10">
                    <tr>
                      <th className="px-4 py-3 font-bold w-12 text-center">
                        <input 
                          type="checkbox" 
                          className="rounded border-gray-300 text-verdant-accent focus:ring-verdant-accent cursor-pointer"
                          checked={isAllCurrentPageSelected}
                          onChange={toggleSelectAll}
                        />
                      </th>
                      <th className="px-4 py-3 font-bold">שם העיר</th>
                      <th className="px-4 py-3 font-bold w-24">פעולות</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 relative">
                    {paginatedCities.map((city) => (
                      <tr 
                        key={city.id} 
                        className={`transition-colors ${selectedIds.has(city.id) ? 'bg-verdant-accent/5' : 'hover:bg-gray-50/50'}`}
                      >
                        <td className="px-4 py-3 text-center">
                          <input 
                            type="checkbox" 
                            className="rounded border-gray-300 text-verdant-accent focus:ring-verdant-accent cursor-pointer"
                            checked={selectedIds.has(city.id)}
                            onChange={() => toggleSelect(city.id)}
                          />
                        </td>
                        <td className="px-4 py-3 font-medium text-verdant-ink">
                          {fixParentheses(city.name)}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => handleDelete(city)}
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                            title="מחק"
                          >
                            <span className="material-symbols-outlined text-[16px]">delete</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                    {paginatedCities.length === 0 && (
                      <tr>
                        <td colSpan={3} className="p-8 text-center text-sm text-verdant-muted">
                          לא נמצאו ערים
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
            
            {/* Pagination Controls */}
            {!loading && filteredCities.length > 0 && (
              <div className="border-t border-gray-100 bg-[#FAFAF7] px-4 py-3 flex items-center justify-between">
                <div className="text-sm text-verdant-muted">
                  מציג <span className="font-bold text-verdant-ink">{(currentPage - 1) * PAGE_SIZE + 1}</span> עד <span className="font-bold text-verdant-ink">{Math.min(currentPage * PAGE_SIZE, filteredCities.length)}</span> מתוך <span className="font-bold text-verdant-ink">{filteredCities.length}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <span className="material-symbols-outlined text-[18px]">chevron_right</span>
                  </button>
                  <span className="text-sm font-medium text-verdant-ink px-2">
                    {currentPage} / {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <span className="material-symbols-outlined text-[18px]">chevron_left</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
