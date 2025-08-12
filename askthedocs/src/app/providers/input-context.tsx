"use client";

import { createContext, useContext, useState, ReactNode } from "react";

interface InputContextType {
  inputValue: string;
  setInputValue: (value: string) => void;
  clearInput: () => void;
}

const InputContext = createContext<InputContextType | undefined>(undefined);

export function InputProvider({ children }: { children: ReactNode }) {
  const [inputValue, setInputValue] = useState("");

  const clearInput = () => setInputValue("");

  return (
    <InputContext.Provider value={{ inputValue, setInputValue, clearInput }}>
      {children}
    </InputContext.Provider>
  );
}

export function useInput() {
  const context = useContext(InputContext);
  if (!context) {
    throw new Error("useInput must be used within InputProvider");
  }
  return context;
}