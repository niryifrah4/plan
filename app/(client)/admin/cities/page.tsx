"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useConfirm } from "@/components/ui/ConfirmModal";

type City = {
  id: string;
  name: string;
  english_name: string | null;
  symbol_code: number | null;
};

export default function AdminCitiesPage() {
  const [cities, setCities] = useState<City[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [newCityName, setNewCityName] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  
  const supabase = createClient();
  const { confirm, modal } = useConfirm();

  const fetchCities = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("israel_cities")
      .select("*")
      .order("name");
    if (!error && data) {
      setCities(data);
    }
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
      // TODO: replace with modal: alert("שגיאה בהוספת עיר: " + error.message);
    } else {
      setNewCityName("");
      setIsAdding(false);
      fetchCities();
    }
  };

  const handleDelete = async (city: City) => {
    const ok = await confirm({
      title: "מחיקת עיר",
      body: `האם אתה בטוח שברצונך למחוק את העיר "${city.name}"?`,
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
      // TODO: replace with modal: alert("שגיאה במחיקת עיר: " + error.message);
    } else {
      fetchCities();
    }
  };

  const filteredCities = cities.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="mx-auto max-w-4xl px-4 py-8" dir="rtl">
      {modal}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">ניהול ערים</h1>
        <p className="text-sm text-gray-500 mt-1">הוספה, מחיקה וניהול רשימת הערים בישראל להשלמה אוטומטית.</p>
      </div>

      <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <input
          type="text"
          placeholder="חיפוש עיר..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="inp w-full max-w-xs"
        />
        
        {!isAdding ? (
          <button
            onClick={() => setIsAdding(true)}
            className="btn btn-primary"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            הוסף עיר חדשה
          </button>
        ) : (
          <form onSubmit={handleAdd} className="flex gap-2">
            <input
              type="text"
              placeholder="שם העיר..."
              value={newCityName}
              onChange={(e) => setNewCityName(e.target.value)}
              className="inp"
              autoFocus
            />
            <button type="submit" className="btn btn-primary">
              שמור
            </button>
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              className="btn bg-gray-100 text-gray-700 hover:bg-gray-200"
            >
              ביטול
            </button>
          </form>
        )}
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="max-h-[600px] overflow-y-auto">
          {loading ? (
            <div className="p-8 text-center text-gray-500">טוען...</div>
          ) : (
            <table className="w-full text-right text-sm">
              <thead className="bg-gray-50 text-gray-500 sticky top-0 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 font-medium">שם העיר</th>
                  <th className="px-6 py-3 font-medium">פעולות</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredCities.map((city) => (
                  <tr key={city.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 font-medium text-gray-900">
                      {city.name}
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => handleDelete(city)}
                        className="text-red-500 hover:text-red-700 flex items-center gap-1 font-bold text-xs bg-red-50 px-2 py-1 rounded transition-colors"
                      >
                        <span className="material-symbols-outlined text-[14px]">delete</span>
                        מחק
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredCities.length === 0 && (
                  <tr>
                    <td colSpan={2} className="p-8 text-center text-gray-500">
                      לא נמצאו ערים מתאימות לחיפוש
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
