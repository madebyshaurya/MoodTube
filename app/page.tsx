'use client'
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { ChevronRight, Loader2 } from "lucide-react";
import React, { useState, useEffect, useRef } from "react";
import Sentiment from "sentiment";
import { Pie } from "react-chartjs-2";
import { Chart as ChartJS, Tooltip, Legend, Title, ArcElement } from "chart.js";
import Image from "next/image";
import Skeleton from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css"; // Import styles if using the skeleton library

ChartJS.register(ArcElement, Tooltip, Legend, Title);

var sentiment = new Sentiment();

const LandingPage: React.FC = () => {
  const [isFetchingVideos, setIsFetchingVideos] = useState(true);
  const [youtubeLink, setYoutubeLink] = useState("");
  const [loading, setLoading] = useState(false);
  const [sentimentData, setSentimentData] = useState<number[]>([]);
  const [percentages, setPercentages] = useState<{
    positive: number;
    negative: number;
    neutral: number;
  }>({
    positive: 0,
    negative: 0,
    neutral: 0,
  });
  const { toast } = useToast();
  const [videos, setVideos] = useState<
    { thumbnail: string; title: string; videoId: string }[]
  >([]);
  const pieChartRef = useRef<HTMLDivElement>(null); // Create a ref for the Pie chart container

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setYoutubeLink(e.target.value);
  };

  function extractVideoId(url: string) {
    const regExp =
      /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
    const match = url.match(regExp);
    return match ? match[1] : null;
  }

  const handleSubmit = async () => {
    setLoading(true);
    setSentimentData([]); // Clear previous sentiment data
    setPercentages({ positive: 0, negative: 0, neutral: 0 }); // Clear previous percentages

    const videoId = extractVideoId(youtubeLink);

    if (videoId) {
      try {
        let allComments: any[] = [];
        let nextPageToken: string | undefined = undefined;
        const maxResults = 100; // Maximum per page
        const totalCommentsNeeded = 5000; // Total comments you want to fetch

        // Fetch comments with pagination
        do {
          const response: any = await fetch(
            `https://www.googleapis.com/youtube/v3/commentThreads?key=${
              process.env.NEXT_PUBLIC_YOUTUBE_API
            }&part=snippet&videoId=${videoId}&maxResults=${maxResults}${
              nextPageToken ? `&pageToken=${nextPageToken}` : ""
            }`
          );
          const result = await response.json();

          if (result.items && result.items.length > 0) {
            allComments = allComments.concat(result.items);
            nextPageToken = result.nextPageToken;
          } else {
            toast({
              description: "No more comments available.",
            });
            break;
          }
        } while (nextPageToken && allComments.length < totalCommentsNeeded);

        // Limit to 1000 comments if more are fetched
        allComments = allComments.slice(0, totalCommentsNeeded);

        // Randomly select 1000 comments from the fetched comments
        const shuffledComments = allComments.sort(() => Math.random() - 0.5);
        const randomComments = shuffledComments.slice(0, totalCommentsNeeded);

        // Analyze sentiment of each comment
        const scores = randomComments.map((comment) => {
          const commentText =
            comment.snippet.topLevelComment.snippet.textOriginal;
          const result = sentiment.analyze(commentText);
          return result.score;
        });

        setSentimentData(scores); // Update sentiment data state

        // Calculate percentages
        const total = scores.length;
        const positiveCount = scores.filter((score) => score > 0).length;
        const negativeCount = scores.filter((score) => score < 0).length;
        const neutralCount = total - positiveCount - negativeCount;

        setPercentages({
          positive: parseFloat(((positiveCount / total) * 100).toFixed(2)),
          negative: parseFloat(((negativeCount / total) * 100).toFixed(2)),
          neutral: parseFloat(((neutralCount / total) * 100).toFixed(2)),
        });

        // Smooth scroll to the Pie chart container
        pieChartRef.current?.scrollIntoView({ behavior: "smooth" });
      } catch (error) {
        console.error(error);
        toast({
          description: "An error occurred while fetching comments.",
        });
      }
    } else {
      toast({
        description: "Invalid YouTube link.",
      });
      setYoutubeLink("");
    }

    setLoading(false);
  };

  // Fetch popular video thumbnails and titles
  useEffect(() => {
    const fetchVideos = async () => {
      setIsFetchingVideos(true);
      try {
        // First, fetch popular videos
        const popularResponse: any = await fetch(
          `https://www.googleapis.com/youtube/v3/videos?key=${process.env.NEXT_PUBLIC_YOUTUBE_API}&part=snippet&chart=mostPopular&maxResults=5`
        );
        const popularResult = await popularResponse.json();

        // Filter and fetch videos with comments enabled
        const videosWithComments = await Promise.all(
          popularResult.items.map(async (item: any) => {
            const commentResponse: any = await fetch(
              `https://www.googleapis.com/youtube/v3/commentThreads?key=${process.env.NEXT_PUBLIC_YOUTUBE_API}&part=id&videoId=${item.id}&maxResults=1`
            );
            const commentResult = await commentResponse.json();

            if (commentResult.items && commentResult.items.length > 0) {
              return {
                thumbnail: item.snippet.thumbnails.high.url,
                title: item.snippet.title,
                videoId: item.id,
              };
            }
            return null;
          })
        );

        // Filter out null values and limit to 5 videos
        const filteredVideos = videosWithComments
          .filter((v) => v !== null)
          .slice(0, 5);
        setVideos(filteredVideos);
      } catch (error) {
        console.error(error);
      } finally {
        setIsFetchingVideos(false);
      }
    };

    fetchVideos();
  }, []);

  // Data and options for the pie chart
  const pieData = {
    labels: ["Positive", "Negative", "Neutral"],
    datasets: [
      {
        data: [percentages.positive, percentages.negative, percentages.neutral],
        backgroundColor: ["#3ECF3C", "#ff474c", "#808080"],
        hoverOffset: 4,
      },
    ],
  };

  const pieOptions = {
    responsive: true,
    plugins: {
      legend: {
        position: "top" as const,
      },
      tooltip: {
        callbacks: {
          label: function (tooltipItem: any) {
            const label = tooltipItem.label || "";
            const value = tooltipItem.raw || 0;
            return `${label}: ${value}%`;
          },
        },
      },
    },
  };

  const handleThumbnailClick = (videoId: string) => {
    const selectedLink = `https://www.youtube.com/watch?v=${videoId}`;
    navigator.clipboard.writeText(selectedLink);
    toast({
      description: "Copied link to clipboard",
    });
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4 bg-white text-black">
      <h1 className="text-9xl u md:text-[10rem] xl:text-[12rem] text-center mb-6">
        MoodTube
      </h1>

      <p className="text-md md:text-lg lg:text-xl text-center mb-8 md:mb-10 md:w-[800px]">
        MoodTube is a tool which uses a YouTube video&apos;s comments and
        machine learning to tell you what type of response it&apos;s getting
        without you having to read individual comments. Try it out below.
      </p>

      <div className="flex flex-col md:flex-row items-center space-y-3 md:space-y-0 md:space-x-3 w-full max-w-xl">
        <Input
          placeholder="https://www.youtube.com/watch?v=dQw4w9WgXcQ"
          value={youtubeLink}
          onChange={handleInputChange}
          className="w-full px-4 py-2 text-black h-[52px] rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <Button
          onClick={handleSubmit}
          disabled={loading}
          className="px-4 py-2 w-full md:w-[200px] h-[52px] flex items-center justify-center group transition-all duration-300"
        >
          {loading ? (
            <Loader2 className="animate-spin" size={20} />
          ) : (
            <>
              Get Analysis
              <ChevronRight
                size={20}
                className="inline group-hover:translate-x-1 transition-all"
              />
            </>
          )}
        </Button>
      </div>
      <p className="text-sm text-gray-400 pt-2">
        More comments = More accuracy
      </p>

      {/* Display sentiment analysis results */}
      <div className="mt-8 w-full max-w-xl" ref={pieChartRef}>
        {sentimentData.length > 0 && (
          <div className="flex flex-col items-center">
            <h2 className="text-lg font-semibold mb-4">
              Sentiment Analysis Results
            </h2>

            {/* Pie Chart */}
            <div className="md:w-[400px] md:h-[400px] w-[300px] h-[300px]">
              <Pie data={pieData} options={pieOptions} />
            </div>
          </div>
        )}
      </div>

      {/* Marquee for YouTube Thumbnails and Titles */}
      <div className="flex flex-col items-center justify-center mb-[200px]">
        <h1 className="text-3xl pt-10">Try one of these trending videos</h1>

        <div className="mt-8 w-full gap-2 flex">
          {isFetchingVideos
            ? // Skeleton loading
              Array(5)
                .fill(0)
                .map((_, index) => (
                  <div key={index} className="flex-shrink-0 w-[200px]">
                    <Skeleton height={112} width={200} className="mb-2" />
                    <Skeleton count={2} />
                  </div>
                ))
            : // Actual video thumbnails and titles
              videos.map((video, index) => (
                <div
                  key={index}
                  className="flex-shrink-0 w-[200px] cursor-pointer"
                  onClick={() => handleThumbnailClick(video.videoId)}
                >
                  <Image
                    src={video.thumbnail}
                    alt={`Video thumbnail ${index + 1}`}
                    width={200}
                    height={112}
                    className="rounded-lg mb-2"
                  />
                  <p className="text-sm text-center text-black">
                    {video.title}
                  </p>
                </div>
              ))}
        </div>
      </div>

      <footer className="bg-black w-screen fixed bottom-0 text-white py-8">
        <div className="text-center">
          <p className="text-md">
            Made By{" "}
            <a
              href="https://x.com/madebyshaurya"
              target="_blank"
              className="relative after:absolute after:bg-gray-200 after:bottom-0 after:left-0 after:h-[2px] after:w-full after:origin-bottom-left after:scale-x-100 hover:after:origin-bottom-right hover:after:scale-x-0 after:transition-transform after:ease-in-out after:duration-300 inline cursor-pointer"
            >
              Shaurya
            </a>
          </p>
        </div>

        <p className="pt-2 text-sm absolute right-4 bottom-2">
          <a
            href="https://github.com/madebyshaurya/MoodTube"
            target="_blank"
            className="relative after:absolute after:bg-gray-200 after:bottom-0 after:left-0 after:h-[2px] after:w-full after:origin-bottom-left after:scale-x-100 hover:after:origin-bottom-right hover:after:scale-x-0 after:transition-transform after:ease-in-out after:duration-300 inline cursor-pointer"
          >
            Source Code on GitHub
          </a>
        </p>
      </footer>
    </div>
  );
};

export default LandingPage;
