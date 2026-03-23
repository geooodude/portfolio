type controlsProps = {
    params: number[];
    colors_inverted: number;

    setParams: (value: number, index: number) => void;
    setColorScheme: (value: number) => void;
    toggleColorsInverted: () => void;
}

type controlsState = {
    mouseOver: boolean;
    collapsed: boolean;
}

type mainProps = {
    params: number[];
    color_scheme: number;
}

export { type controlsProps, type mainProps, type controlsState }